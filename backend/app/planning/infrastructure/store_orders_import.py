"""Carga el «Reporte pedidos en tienda detalle» (Proyección tiendas.xlsx) como pedidos de brasa.

Del reporte se toman las líneas de pollo entero para brasa: zona, fecha de entrega (FECHA),
unidades (CANTIDAD 2), kg (CANTIDAD 1) y RANGO («B7» = Brasa 7). Se guardan en la tabla de
pedidos de despacho, sin vendedor, para que el cálculo de saca los cuente como pedidos de ese día.

SUPUESTOS (docs/assumptions.md): el rango Bn es la Brasa n; «Chico Tipo B» (B0 o sin rango) va a
la Brasa 1, el producto más chico del catálogo. Cada carga reemplaza los pedidos de tiendas que ya
estuvieran (los de ARIS no se tocan).
"""

import re
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook
from sqlalchemy import delete, insert
from sqlalchemy.orm import Session

from app.planning.domain.models import Product
from app.planning.infrastructure.persistence.tables import dispatch_orders

# Marca de las filas que vienen del reporte de tiendas (para reemplazarlas en la siguiente carga).
STORE_CODE_PREFIX = "TIENDA-"
_RANGE = re.compile(r"B\s*(\d+)", re.IGNORECASE)


def _day(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    day, month, year = (int(part) for part in str(value).strip().split("/"))
    return date(year, month, day)


def _number(value: object) -> float:
    if value in (None, ""):
        return 0.0
    return float(str(value).replace(",", "."))


def _brasa(rango: object, material: str, brasa: dict[int, Product]) -> Product | None:
    found = _RANGE.search(str(rango or ""))
    if found:
        n = int(found.group(1))
    elif "TIPO B" in material.upper():
        n = 0
    else:
        return None
    return brasa.get(min(max(n, 1), max(brasa))) if brasa else None


def load_store_orders(session: Session, path: Path, products: list[Product]) -> tuple[int, int]:
    """Reemplaza los pedidos de tiendas con los del archivo. Devuelve (cargadas, descartadas)."""
    brasa = {}
    for p in products:
        number = re.search(r"(\d+)$", p.name)
        if p.category == "BRASA" and number and p.is_projectable:
            brasa[int(number.group(1))] = p
    workbook = load_workbook(path, read_only=True, data_only=True)
    rows = list(workbook.worksheets[0].iter_rows(values_only=True))
    workbook.close()
    head = next(
        i for i, r in enumerate(rows) if r and "MATERIAL" in [str(c).strip() for c in r if c]
    )
    col = {str(c).strip(): i for i, c in enumerate(rows[head]) if c}
    batch, skipped = [], 0
    for r in rows[head + 1 :]:
        material = str(r[col["MATERIAL"]] or "").strip()
        if "BRASA" not in material.upper() or "POLLO ENTERO" not in material.upper():
            continue
        try:
            product = _brasa(r[col.get("RANGO", -1)] if "RANGO" in col else None, material, brasa)
            if product is None:
                skipped += 1
                continue
            day = _day(r[col["FECHA"]])
            w = product.kg_per_unit
            batch.append(
                {
                    "order_number": int(str(r[col["COD. PEDIDO"]]).strip()),
                    "customer": str(r[col["TIENDA"]] or "").strip(),
                    "material_code": f"{STORE_CODE_PREFIX}{str(r[col['CODIGO']] or '').strip()}",
                    # Rango de peso del producto: así el cálculo de saca lo lleva a esa Brasa.
                    "material": (
                        f"POLLO ENTERO BRASA TIENDA {product.name.upper()} ({w:.2f}-{w + 0.09:.2f})"
                    ),
                    "ordered_kg": _number(r[col["CANTIDAD 1"]]),
                    "dispatched_kg": 0.0,
                    "ordered_units": _number(r[col["CANTIDAD 2"]]),
                    "dispatched_units": 0.0,
                    "zone": str(r[col["ZONA"]] or "").strip() or None,
                    "registered_on": day,
                    "delivery_date": day,
                    "seller": None,
                }
            )
        except (KeyError, ValueError, TypeError):
            skipped += 1
    t = dispatch_orders.c
    session.execute(delete(dispatch_orders).where(t.material_code.startswith(STORE_CODE_PREFIX)))
    if batch:
        session.execute(insert(dispatch_orders), batch)
    return len(batch), skipped
