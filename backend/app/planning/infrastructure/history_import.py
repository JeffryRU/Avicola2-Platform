"""Carga la historia del negocio desde los CSV exportados de ARIS y de las tiendas.

DESPACHO.csv: una fila por línea de pedido (cliente, material, kg pedidos y despachados).
VENTAS.csv: una fila por línea de venta en tienda. El export repite cada línea (viene de un cruce
de tablas), así que se toma una sola vez por `PedidoOdooDetalleID`. De la venta no se guarda
quién compró (nombre y documento del cliente): no hace falta para planificar la demanda.

Cada carga reemplaza la tabla completa: los CSV son el export entero, no un incremento.
"""

import csv
from collections.abc import Callable, Iterator
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import Table, delete, insert
from sqlalchemy.orm import Session

from app.planning.infrastructure.persistence.tables import dispatch_orders, store_sales

BATCH = 5000
Row = dict[str, Any]


def _text(value: str) -> str | None:
    return value.strip() or None


def _number(value: str) -> float:
    return float(value) if value.strip() else 0.0


def _order(row: dict[str, str]) -> Row:
    return {
        "order_number": int(row["NumeroPedido"]),
        "customer": row["PedidoCliente"].strip(),
        "material_code": _text(row["PedidoDetalleMaterialCodigo"]),
        "material": row["PedidoDetalleMaterial"].strip(),
        "ordered_kg": _number(row["PedidoDetalleKilos"]),
        "dispatched_kg": _number(row["PesoDespachado"]),
        "ordered_units": _number(row["PedidoDetalleCantidad"]),
        "dispatched_units": _number(row["CantidadDespachada"]),
        "zone": _text(row["PedidoZona"]),
        "registered_on": date.fromisoformat(row["FechaRegistro"]),
        "delivery_date": date.fromisoformat(row["FechaEntrega"]),
        "seller": _text(row["Vendedor"]),
    }


def _sale(row: dict[str, str]) -> Row:
    return {
        "source_line_id": int(row["PedidoOdooDetalleID"]),
        "document": row["CodigoDocumentoEmitido"].strip(),
        "document_type": row["TipoDocumentoEmitidoDescripcion"].strip(),
        "grouping": _text(row["TipoAgrupacion"]),
        "date": date.fromisoformat(row["FechaPedido"]),
        "store_code": row["TiendaCodigo"].strip(),
        "store": row["Tienda"].strip(),
        "material_code": row["MaterialCodigoSAP"].strip(),
        "material": row["MaterialDescripcion"].strip(),
        "quantity": _number(row["Cantidad"]),
        "unit": _text(row["UnidadMedidaCodigo_DET"]),
        "unit_price": _number(row["PrecioUnitario"]),
    }


def _rows(path: Path, convert: Callable[[dict[str, str]], Row]) -> Iterator[Row | None]:
    """Cada fila convertida, o None si no se pudo leer (fecha o número inválidos)."""
    with path.open(encoding="utf-8-sig", newline="") as fh:
        for raw in csv.DictReader(fh):
            try:
                yield convert(raw)
            except (KeyError, ValueError, AttributeError):
                yield None


def _load(
    session: Session,
    table: Table,
    path: Path,
    convert: Callable[[dict[str, str]], Row],
    unique: str | None = None,
) -> tuple[int, int]:
    """Reemplaza la tabla con el archivo. Devuelve (filas cargadas, filas descartadas)."""
    session.execute(delete(table))
    seen: set[Any] = set()
    batch: list[Row] = []
    loaded = skipped = 0
    for row in _rows(path, convert):
        if row is None:
            skipped += 1
            continue
        if unique:
            if row[unique] in seen:
                continue
            seen.add(row[unique])
        batch.append(row)
        if len(batch) == BATCH:
            session.execute(insert(table), batch)
            loaded += len(batch)
            batch = []
    if batch:
        session.execute(insert(table), batch)
        loaded += len(batch)
    return loaded, skipped


def load_dispatch_orders(session: Session, path: Path) -> tuple[int, int]:
    return _load(session, dispatch_orders, path, _order)


def load_store_sales(session: Session, path: Path) -> tuple[int, int]:
    return _load(session, store_sales, path, _sale, unique="source_line_id")
