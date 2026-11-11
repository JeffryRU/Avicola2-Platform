"""Pedidos reales de ARIS llevados a los productos del catálogo (Python puro).

Sirven de historia para sugerir la proyección. La equivalencia material → producto todavía no
la define el negocio; mientras tanto se usa la más directa (ver `product_for`).
"""

import re
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import median

from app.planning.domain.models import Product

# Solo el pollo entero para brasa: los marinados y macerados son otros productos.
ORDER_MATERIAL_PREFIX = "POLLO ENTERO BRASA"
ORDER_CATEGORY = "BRASA"
# Semanas del mismo día de la semana que se miran. La mediana de 4 fue la mejor regla simple en
# la validación con pedidos reales (ADR 0012): 53,1 % de error contra 56,9 % del promedio.
MEDIAN_WEEKS = 4
# Cuánta historia se consulta: de sobra para 4 semanas aunque la carga tenga meses.
ORDER_LOOKBACK = timedelta(days=400)

_RANGE = re.compile(r"\((\d+\.\d+)-(\d+\.\d+)\)")
_MIN_BIRD_KG, _MAX_BIRD_KG = 0.8, 2.4


@dataclass(frozen=True)
class OrderLine:
    date: date
    material: str
    ordered_kg: float
    ordered_units: float
    dispatched_kg: float
    dispatched_units: float


def product_for(line: OrderLine, products: list[Product]) -> Product | None:
    """Producto del catálogo al que corresponde la línea, o None si no se puede saber.

    El material trae el rango de peso entre paréntesis («(1.60-1.69)»): le toca el producto de
    mayor peso que no pase del inicio del rango (1,60 → el de 1,6 kg). Si no trae rango, se usa
    el peso promedio de lo despachado. `products` son los de la categoría.
    """
    found = _RANGE.search(line.material)
    weight = float(found.group(1)) if found else 0.0
    if weight <= 0 and line.dispatched_units > 0:
        weight = line.dispatched_kg / line.dispatched_units
        if not _MIN_BIRD_KG <= weight <= _MAX_BIRD_KG:
            return None
    if weight <= 0:
        return None
    by_weight = sorted(products, key=lambda p: p.kg_per_unit)
    fitting = [p for p in by_weight if p.kg_per_unit <= weight + 0.005]
    return fitting[-1] if fitting else by_weight[0] if by_weight else None


def daily_units(lines: list[OrderLine], products: list[Product]) -> dict[date, dict[str, float]]:
    """Unidades pedidas por día y producto. Si el pedido vino solo en kg, se pasa a unidades."""
    days: dict[date, dict[str, float]] = {}
    for line in lines:
        product = product_for(line, products)
        if product is None:
            continue
        units = (
            line.ordered_units if line.ordered_units > 0 else line.ordered_kg / product.kg_per_unit
        )
        day = days.setdefault(line.date, {})
        day[product.id] = day.get(product.id, 0.0) + units
    return days


def weekday_median(
    history: dict[date, dict[str, float]], target: date, weeks: int = MEDIAN_WEEKS
) -> dict[str, int]:
    """Mediana, por producto, de los últimos `weeks` días iguales al de `target` con historia.

    Se cuentan hacia atrás desde el último día con pedidos (la carga puede tener semanas de
    atraso); un día sin pedidos dentro de la historia cuenta como 0. Vacío si falta historia.
    """
    known = [d for d in history if d < target]
    if not known:
        return {}
    first, last = min(known), max(known)
    day = target - timedelta(days=7)
    while day > last:
        day -= timedelta(days=7)
    same_weekday = []
    while day >= first and len(same_weekday) < weeks:
        same_weekday.append(history.get(day, {}))
        day -= timedelta(days=7)
    if len(same_weekday) < weeks:
        return {}
    products = {pid for units in same_weekday for pid in units}
    result = {pid: round(median(units.get(pid, 0.0) for units in same_weekday)) for pid in products}
    return {pid: units for pid, units in result.items() if units > 0}
