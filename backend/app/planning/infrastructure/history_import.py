"""Carga la historia del negocio desde los CSV exportados de ARIS y de las tiendas.

DESPACHO.csv: una fila por línea de pedido (cliente, material, kg pedidos y despachados).
VENTAS.csv: una fila por línea de venta en tienda. El export repite cada línea (viene de un cruce
de tablas), así que se toma una sola vez por `PedidoOdooDetalleID`. De la venta no se guarda
quién compró (nombre y documento del cliente): no hace falta para planificar la demanda.

Cada carga reemplaza la tabla completa: los CSV son el export entero, no un incremento. Las
columnas de cada export están en config/imports.yaml.
"""

from pathlib import Path
from typing import Any

from sqlalchemy import Table, delete, insert
from sqlalchemy.orm import Session

from app.planning.domain.file_specs import FileSpec, RowIssues
from app.planning.infrastructure.file_specs import file_spec
from app.planning.infrastructure.persistence.tables import dispatch_orders, store_sales
from app.planning.infrastructure.tabular import csv_rows, match, records
from app.shared.domain.errors import DomainError

BATCH = 5000
Row = dict[str, Any]


def _load(session: Session, table: Table, path: Path, spec: FileSpec) -> tuple[int, int]:
    """Reemplaza la tabla con el archivo. Devuelve (filas cargadas, filas descartadas).

    Las columnas salen de config/imports.yaml; si falta una, no se toca la tabla."""
    with path.open(encoding="utf-8-sig", newline="") as fh:
        found = match(iter(csv_rows(fh.read())), [spec])
    if found is None:
        raise DomainError(f"{path.name} no es el {spec.label}: no tiene sus columnas.")
    session.execute(delete(table))
    seen: set[Any] = set()
    batch: list[Row] = []
    loaded = 0
    issues = RowIssues()
    for row in records(found, issues):
        if spec.unique:
            if row[spec.unique] in seen:
                continue
            seen.add(row[spec.unique])
        batch.append(row)
        if len(batch) == BATCH:
            session.execute(insert(table), batch)
            loaded += len(batch)
            batch = []
    if batch:
        session.execute(insert(table), batch)
        loaded += len(batch)
    return loaded, issues.count


def load_dispatch_orders(session: Session, path: Path) -> tuple[int, int]:
    return _load(session, dispatch_orders, path, file_spec("despacho"))


def load_store_sales(session: Session, path: Path) -> tuple[int, int]:
    return _load(session, store_sales, path, file_spec("ventas"))
