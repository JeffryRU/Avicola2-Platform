"""Producción diaria: lo que se pidió a granja y lo que llegó, por producto (Python puro).

La registra el jefe de despacho. Con esa historia se estima en qué rango llegará lo que se pida
(`estimate_arrival`): se pide casi todo en un rango por tipo, pero las aves llegan repartidas.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.shared.domain.errors import DomainError

# Días hacia atrás que se pueden registrar o corregir (hoy incluido). Nunca días futuros.
PRODUCTION_BACK_DAYS = 7
MAX_BIRDS = 1_000_000

# Modelo de llegada: suavizado exponencial sobre los días con registro. Fue el mejor de 13 en la
# validación hacia adelante con datos reales (ADR 0011): 28,8 % de error por rango contra 79,9 %
# de suponer que llega lo pedido. Con vida media de 2 a 7 días el resultado es casi igual.
HALF_LIFE_DAYS = 7.0
# Días con registro que se usan (más atrás, el peso ya es despreciable) y mínimo para estimar.
HISTORY_DAYS = 60
MIN_HISTORY_DAYS = 14
# Cuánto calendario se consulta para reunir esa historia.
LOOKBACK = timedelta(days=120)


@dataclass(frozen=True)
class ProductionLine:
    product_id: str
    # Aves pedidas a granja en ese rango (puede traer decimales: el pedido se reparte en %).
    ordered: float
    produced: int
    quality_b: int

    @property
    def quality_a(self) -> int:
        return self.produced - self.quality_b


@dataclass(frozen=True)
class DailyProduction:
    date: date
    lines: tuple[ProductionLine, ...]
    recorded_by: str
    recorded_at: datetime

    @property
    def ordered(self) -> float:
        return round(sum(line.ordered for line in self.lines), 2)

    @property
    def produced(self) -> int:
        return sum(line.produced for line in self.lines)

    @property
    def quality_b(self) -> int:
        return sum(line.quality_b for line in self.lines)


def check_production_date(day: date, today: date) -> None:
    if day > today:
        raise DomainError("No se puede registrar la producción de un día que aún no llega.")
    if day < today - timedelta(days=PRODUCTION_BACK_DAYS):
        raise DomainError(
            "Solo se puede registrar o corregir la producción de los últimos "
            f"{PRODUCTION_BACK_DAYS} días."
        )


@dataclass(frozen=True)
class ArrivalEstimate:
    """Qué se espera que llegue, por producto, y con cuánta historia se estimó."""

    # Aves esperadas por producto y, de ellas, cuántas en calidad A.
    expected: dict[str, int]
    expected_a: dict[str, int]
    days: int
    date_from: date
    date_to: date


def estimate_arrival(
    history: list[DailyProduction],
    group_of: dict[str, str],
    request_by_group: dict[str, float],
) -> ArrivalEstimate | None:
    """Reparte lo que se va a pedir de cada tipo entre sus rangos, según la historia reciente.

    Por producto: aves que llegaron de ese rango por cada ave pedida de su tipo, con más peso en
    los días recientes. `group_of` dice a qué tipo pertenece cada producto. Devuelve None si no
    hay historia suficiente.
    """
    usable = sorted((d for d in history if d.ordered > 0 and d.produced > 0), key=lambda d: d.date)[
        -HISTORY_DAYS:
    ]
    if len(usable) < MIN_HISTORY_DAYS:
        return None
    arrived: dict[str, float] = {}
    second: dict[str, float] = {}
    asked: dict[str, float] = {}
    for age, day in enumerate(reversed(usable)):
        weight = 0.5 ** (age / HALF_LIFE_DAYS)
        for line in day.lines:
            group = group_of.get(line.product_id)
            if group is None:
                continue
            arrived[line.product_id] = arrived.get(line.product_id, 0.0) + weight * line.produced
            second[line.product_id] = second.get(line.product_id, 0.0) + weight * line.quality_b
            asked[group] = asked.get(group, 0.0) + weight * line.ordered
    expected: dict[str, int] = {}
    expected_a: dict[str, int] = {}
    for product, group in group_of.items():
        base = asked.get(group, 0.0)
        birds = request_by_group.get(group, 0.0) * arrived.get(product, 0.0) / base if base else 0.0
        b_rate = second.get(product, 0.0) / arrived[product] if arrived.get(product) else 0.0
        expected[product] = round(birds)
        expected_a[product] = round(birds * (1 - b_rate))
    return ArrivalEstimate(expected, expected_a, len(usable), usable[0].date, usable[-1].date)
