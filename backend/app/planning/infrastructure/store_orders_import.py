"""Carga el «Reporte pedidos en tienda detalle» (Proyección tiendas.xlsx) como pedidos de brasa.

Del reporte se toman las líneas de pollo entero para brasa: zona, fecha de entrega (FECHA),
unidades (CANTIDAD 2), kg (CANTIDAD 1) y RANGO («B7» = Brasa 7). Se guardan en la tabla de
pedidos de despacho, sin vendedor, para que el cálculo de saca los cuente como pedidos de ese día.

SUPUESTOS (docs/assumptions.md): el rango Bn es la Brasa n; «Chico Tipo B» (B0 o sin rango) va a
la Brasa 1, el producto más chico del catálogo. Cada carga reemplaza los pedidos de tiendas que ya
estuvieran (los de ARIS no se tocan).
"""

import re
from pathlib import Path

from sqlalchemy import delete, insert
from sqlalchemy.orm import Session

from app.planning.domain.file_specs import RowIssues
from app.planning.domain.models import Product
from app.planning.domain.orders import ORDER_CATEGORY
from app.planning.infrastructure.file_specs import file_spec
from app.planning.infrastructure.persistence.tables import dispatch_orders
from app.planning.infrastructure.tabular import match, open_workbook, records
from app.shared.domain.errors import DomainError

# Marca de las filas que vienen del reporte de tiendas (para reemplazarlas en la siguiente carga).
STORE_CODE_PREFIX = "TIENDA-"
_RANGE = re.compile(r"B\s*(\d+)", re.IGNORECASE)


def _brasa(rango: str | None, material: str, brasa: dict[int, Product]) -> Product | None:
    found = _RANGE.search(rango or "")
    if found:
        n = int(found.group(1))
    elif "TIPO B" in material.upper():
        n = 0
    else:
        return None
    return brasa.get(min(max(n, 1), max(brasa))) if brasa else None


def load_store_orders(session: Session, path: Path, products: list[Product]) -> tuple[int, int]:
    """Reemplaza los pedidos de tiendas con los del archivo. Devuelve (cargadas, descartadas).

    Las columnas del reporte están en config/imports.yaml (archivo «tiendas»)."""
    spec = file_spec("tiendas")
    brasa = {}
    for p in products:
        number = re.search(r"(\d+)$", p.name)
        if p.category == ORDER_CATEGORY and number and p.is_projectable:
            brasa[int(number.group(1))] = p
    book = open_workbook(path)
    try:
        sheets = [book[spec.sheet]] if spec.sheet in book.sheetnames else book.worksheets
        found = next(
            (f for f in (match(ws.iter_rows(values_only=True), [spec]) for ws in sheets) if f),
            None,
        )
        if found is None:
            raise DomainError(f"{path.name} no es el {spec.label}: no tiene sus columnas.")
        issues = RowIssues()
        lines = list(records(found, issues))
    finally:
        book.close()
    batch, skipped = [], issues.count
    for r in lines:
        product = _brasa(r["range"], r["material"], brasa)
        if product is None:
            skipped += 1
            continue
        w = product.kg_per_unit
        batch.append(
            {
                "order_number": r["order_number"],
                "customer": r["store"],
                "material_code": f"{STORE_CODE_PREFIX}{r['code'] or ''}",
                # Rango de peso del producto: así el cálculo de saca lo lleva a esa Brasa.
                "material": (
                    f"POLLO ENTERO BRASA TIENDA {product.name.upper()} ({w:.2f}-{w + 0.09:.2f})"
                ),
                "ordered_kg": r["kg"],
                "dispatched_kg": 0.0,
                "ordered_units": r["units"],
                "dispatched_units": 0.0,
                "zone": r["zone"],
                "registered_on": r["date"],
                "delivery_date": r["date"],
                "seller": None,
            }
        )
    t = dispatch_orders.c
    session.execute(delete(dispatch_orders).where(t.material_code.startswith(STORE_CODE_PREFIX)))
    if batch:
        session.execute(insert(dispatch_orders), batch)
    return len(batch), skipped
