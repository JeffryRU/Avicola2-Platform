"""Carga incremental de los exports de ARIS (DESPACHO y VENTAS), desde la app o desde n8n.

A diferencia de `cli historia` (que reemplaza las tablas completas con el export entero), aquí
se reemplazan solo las fechas que trae el archivo: el resto de la historia queda igual. Así se
puede subir el export de un día, de una semana o el completo, y volver a subir el mismo sin
duplicar nada.

Acepta CSV (DESPACHO o VENTAS) y Excel con las hojas DESPACHO y/o VENTAS. El tipo se reconoce
por las columnas, no por el nombre del archivo.
"""

import csv
import zipfile
from collections.abc import Iterator
from datetime import date
from typing import Any

from sqlalchemy import Table, delete, func, insert, select
from sqlalchemy.orm import Session

from app.planning.application.ports import ArisLoad
from app.planning.domain.file_specs import FileSpec, RowIssues
from app.planning.infrastructure.file_specs import file_specs
from app.planning.infrastructure.history_import import BATCH, Row
from app.planning.infrastructure.persistence.tables import dispatch_orders, store_sales
from app.planning.infrastructure.store_orders_import import STORE_CODE_PREFIX
from app.planning.infrastructure.tabular import (
    Found,
    csv_rows,
    decode,
    match,
    open_workbook,
    records,
)
from app.shared.domain.errors import DomainError

ZIP_MAGIC = b"PK"
TABLES: dict[str, Table] = {"dispatch_orders": dispatch_orders, "store_sales": store_sales}
UNREADABLE = "No se pudo leer el archivo: puede estar dañado o no ser el export de ARIS."
NOT_RECOGNIZED = (
    "No se reconoce el archivo: debe ser el export de ARIS de DESPACHO o de VENTAS "
    "(CSV, o Excel con esas hojas)."
)


def _aris_specs() -> list[FileSpec]:
    return [s for s in file_specs().values() if s.upload == "aris"]


def _csv_tables(content: bytes) -> Iterator[Found]:
    found = match(iter(csv_rows(decode(content))), _aris_specs())
    if found:
        yield found


def _xlsx_tables(content: bytes) -> Iterator[Found]:
    try:
        book = open_workbook(content)
    except Exception as exc:
        raise DomainError("No se pudo abrir el Excel: puede estar dañado o protegido.") from exc
    try:
        for sheet in book.worksheets:
            found = match(sheet.iter_rows(values_only=True), _aris_specs())
            if found:
                yield found
    finally:
        book.close()


# Los pedidos de tiendas (`cli tiendas`) comparten la tabla de despacho pero no son de ARIS.
_NOT_STORES = ~dispatch_orders.c.material_code.startswith(STORE_CODE_PREFIX, autoescape=True)


class _Merger:
    """Inserta por lotes reemplazando cada fecha la primera vez que aparece en el archivo."""

    def __init__(self, session: Session, table: Table, date_col: str, unique: str | None):
        self.session, self.table, self.date_col, self.unique = session, table, date_col, unique
        self.dates: set[date] = set()
        self.seen: set[Any] = set()
        self.batch: list[Row] = []
        self.loaded = 0

    def add(self, row: Row) -> None:
        if self.unique:
            if row[self.unique] in self.seen:
                return  # el export repite líneas (viene de un cruce de tablas)
            self.seen.add(row[self.unique])
        day = row[self.date_col]
        if day not in self.dates:
            self.dates.add(day)
            self._flush()  # lo pendiente de otras fechas, antes de borrar esta
            column = self.table.c[self.date_col]
            query = delete(self.table).where(column == day)
            if self.table is dispatch_orders:
                query = query.where(_NOT_STORES)  # los pedidos de tiendas no vienen de ARIS
            self.session.execute(query)
        self.batch.append(row)
        if len(self.batch) >= BATCH:
            self._flush()

    def _flush(self) -> None:
        if not self.batch:
            return
        if self.unique:
            # Una línea que antes estaba en otra fecha: se reemplaza, no se duplica.
            ids = [r[self.unique] for r in self.batch]
            self.session.execute(delete(self.table).where(self.table.c[self.unique].in_(ids)))
        self.session.execute(insert(self.table), self.batch)
        self.loaded += len(self.batch)
        self.batch = []

    def result(self, kind: str, issues: RowIssues) -> ArisLoad:
        self._flush()
        return ArisLoad(
            kind,
            self.loaded,
            issues.count,
            min(self.dates) if self.dates else None,
            max(self.dates) if self.dates else None,
            tuple(issues.samples),
        )


class SqlArisData:
    """Los datos de ARIS en la base: hasta qué día llegan y la carga incremental."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def coverage(self) -> tuple[date | None, date | None]:
        """Último día con despacho y último día con ventas en tienda."""
        return (
            self.session.scalar(
                select(func.max(dispatch_orders.c.delivery_date)).where(_NOT_STORES)
            ),
            self.session.scalar(select(func.max(store_sales.c.date))),
        )

    def load(self, content: bytes, filename: str) -> list[ArisLoad]:
        name = filename.lower()
        # WhatsApp y Telegram a veces no traen el nombre: un .xlsx es un ZIP (empieza con «PK»).
        is_excel = name.endswith((".xlsx", ".xlsm")) or content[:2] == ZIP_MAGIC
        if is_excel:
            tables = _xlsx_tables(content)
        elif name.endswith((".csv", ".txt")) or "." not in name:
            tables = _csv_tables(content)
        else:
            raise DomainError("Sube el export de ARIS en Excel (.xlsx) o CSV.")
        results = []
        try:
            for found in tables:
                spec = found[0]
                merger = _Merger(
                    self.session, TABLES[spec.table or ""], spec.date_field or "", spec.unique
                )
                issues = RowIssues()
                for row in records(found, issues):
                    merger.add(row)
                results.append(merger.result(spec.key, issues))
        except DomainError:
            self.session.rollback()
            raise
        except (csv.Error, zipfile.BadZipFile, KeyError, ValueError, TypeError) as exc:
            # Un archivo dañado o que no es lo que dice ser: no se guarda nada.
            self.session.rollback()
            raise DomainError(UNREADABLE) from exc
        if not results:
            raise DomainError(NOT_RECOGNIZED)
        if not any(r.rows for r in results):
            self.session.rollback()
            raise DomainError("El archivo no trae ninguna fila válida de ARIS.")
        self.session.commit()
        return results
