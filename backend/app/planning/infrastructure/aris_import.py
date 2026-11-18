"""Carga incremental de los exports de ARIS (DESPACHO y VENTAS), desde la app o desde n8n.

A diferencia de `cli historia` (que reemplaza las tablas completas con el export entero), aquí
se reemplazan solo las fechas que trae el archivo: el resto de la historia queda igual. Así se
puede subir el export de un día, de una semana o el completo, y volver a subir el mismo sin
duplicar nada.

Acepta CSV (DESPACHO o VENTAS) y Excel con las hojas DESPACHO y/o VENTAS. El tipo se reconoce
por las columnas, no por el nombre del archivo.
"""

import csv
import io
from collections.abc import Callable, Iterable, Iterator
from datetime import date, datetime
from typing import Any

from openpyxl import load_workbook
from sqlalchemy import Table, delete, func, insert, select
from sqlalchemy.orm import Session

from app.planning.application.ports import ArisLoad
from app.planning.infrastructure.history_import import BATCH, Row, _order, _sale
from app.planning.infrastructure.persistence.tables import dispatch_orders, store_sales
from app.shared.domain.errors import DomainError

DISPATCH, SALES = "despacho", "ventas"
# Columnas que identifican cada export (y que necesita su conversión).
SIGNATURES = {
    DISPATCH: {"NumeroPedido", "FechaEntrega", "CantidadDespachada", "PedidoDetalleMaterial"},
    SALES: {"PedidoOdooDetalleID", "FechaPedido", "MaterialDescripcion", "Cantidad"},
}
ISO_DATE = len("2026-01-01")
ZIP_MAGIC = b"PK"
# Cuántas filas mirar arriba de la hoja buscando la fila de títulos.
HEADER_SCAN = 20
NOT_RECOGNIZED = (
    "No se reconoce el archivo: debe ser el export de ARIS de DESPACHO o de VENTAS "
    "(CSV, o Excel con esas hojas)."
)


def _kind(header: Iterable[str]) -> str | None:
    names = set(header)
    return next((k for k, cols in SIGNATURES.items() if cols <= names), None)


def _cell(value: Any) -> str:
    """El valor de una celda como texto, igual que en el CSV de ARIS."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value).strip()
    if len(text) > ISO_DATE and text[4] == "-" and text[ISO_DATE] == " ":
        return text[:ISO_DATE]  # fecha con hora en texto: "2026-07-01 00:00:00"
    return "" if text.upper() == "NULL" else text


def _csv_tables(content: bytes) -> Iterator[tuple[str, Iterator[dict[str, str]]]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    sample = text[:4096]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    kind = _kind(h.strip() for h in reader.fieldnames or [])
    if kind:
        yield kind, ({k.strip(): _cell(v) for k, v in r.items() if k} for r in reader)


def _sheet_rows(sheet) -> tuple[str | None, Iterator[dict[str, str]]]:
    rows = sheet.iter_rows(values_only=True)
    for _ in range(HEADER_SCAN):
        first = next(rows, None)
        if first is None:
            break
        header = [_cell(c) for c in first]
        kind = _kind(header)
        if kind:
            return kind, (
                {h: _cell(v) for h, v in zip(header, r, strict=False) if h}
                for r in rows
                if r and any(c not in (None, "") for c in r)
            )
    return None, iter(())


def _xlsx_tables(content: bytes) -> Iterator[tuple[str, Iterator[dict[str, str]]]]:
    try:
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        raise DomainError("No se pudo abrir el Excel: puede estar dañado o protegido.") from exc
    try:
        for sheet in workbook.worksheets:
            kind, rows = _sheet_rows(sheet)
            if kind:
                yield kind, rows
    finally:
        workbook.close()


class _Merger:
    """Inserta por lotes reemplazando cada fecha la primera vez que aparece en el archivo."""

    def __init__(self, session: Session, table: Table, date_col: str, unique: str | None):
        self.session, self.table, self.date_col, self.unique = session, table, date_col, unique
        self.dates: set[date] = set()
        self.seen: set[Any] = set()
        self.batch: list[Row] = []
        self.loaded = self.skipped = 0

    def add(self, row: Row | None) -> None:
        if row is None:
            self.skipped += 1
            return
        if self.unique:
            if row[self.unique] in self.seen:
                return  # el export repite líneas (viene de un cruce de tablas)
            self.seen.add(row[self.unique])
        day = row[self.date_col]
        if day not in self.dates:
            self.dates.add(day)
            self._flush()  # lo pendiente de otras fechas, antes de borrar esta
            column = self.table.c[self.date_col]
            self.session.execute(delete(self.table).where(column == day))
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

    def result(self, kind: str) -> ArisLoad:
        self._flush()
        return ArisLoad(
            kind,
            self.loaded,
            self.skipped,
            min(self.dates) if self.dates else None,
            max(self.dates) if self.dates else None,
        )


TARGETS: dict[str, tuple[Table, str, Callable[[dict[str, str]], Row], str | None]] = {
    DISPATCH: (dispatch_orders, "delivery_date", _order, None),
    SALES: (store_sales, "date", _sale, "source_line_id"),
}


def _convert(convert: Callable[[dict[str, str]], Row], raw: dict[str, str]) -> Row | None:
    try:
        return convert(raw)
    except (KeyError, ValueError, AttributeError, TypeError):
        return None


class SqlArisData:
    """Los datos de ARIS en la base: hasta qué día llegan y la carga incremental."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def coverage(self) -> tuple[date | None, date | None]:
        """Último día con despacho y último día con ventas en tienda."""
        return (
            self.session.scalar(select(func.max(dispatch_orders.c.delivery_date))),
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
        for kind, rows in tables:
            table, date_col, convert, unique = TARGETS[kind]
            merger = _Merger(self.session, table, date_col, unique)
            for raw in rows:
                merger.add(_convert(convert, raw))
            results.append(merger.result(kind))
        if not results:
            raise DomainError(NOT_RECOGNIZED)
        if not any(r.rows for r in results):
            self.session.rollback()
            raise DomainError("El archivo no trae ninguna fila válida de ARIS.")
        self.session.commit()
        return results
