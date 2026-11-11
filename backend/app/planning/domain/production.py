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


@dataclass(frozen=True)
class ArrivalRates:
    """El modelo ya ajustado: cómo se reparte entre rangos lo que se pide de cada tipo."""

    # Aves que llegan de ese producto por cada ave pedida de su tipo.
    share: dict[str, float]
    # De las que llegan de ese producto, qué parte sale en calidad B.
    b_rate: dict[str, float]
    days: int
    date_from: date
    date_to: date

    def expect(self, product_id: str, requested: float) -> tuple[int, int]:
        """Aves esperadas de un producto y cuántas en calidad A, si se pide `requested` del tipo."""
        birds = requested * self.share.get(product_id, 0.0)
        return round(birds), round(birds * (1 - self.b_rate.get(product_id, 0.0)))


def _usable(history: list[DailyProduction]) -> list[DailyProduction]:
    return sorted((d for d in history if d.ordered > 0 and d.produced > 0), key=lambda d: d.date)


def arrival_rates(history: list[DailyProduction], group_of: dict[str, str]) -> ArrivalRates | None:
    """Ajusta el modelo con la historia: por producto, aves que llegaron de ese rango por cada
    ave pedida de su tipo, con más peso en los días recientes. `group_of` dice a qué tipo
    pertenece cada producto. Devuelve None si no hay historia suficiente.
    """
    usable = _usable(history)[-HISTORY_DAYS:]
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
    share: dict[str, float] = {}
    b_rate: dict[str, float] = {}
    for product, group in group_of.items():
        base = asked.get(group, 0.0)
        share[product] = arrived.get(product, 0.0) / base if base else 0.0
        b_rate[product] = (
            second.get(product, 0.0) / arrived[product] if arrived.get(product) else 0.0
        )
    return ArrivalRates(share, b_rate, len(usable), usable[0].date, usable[-1].date)


def estimate_arrival(
    history: list[DailyProduction],
    group_of: dict[str, str],
    request_by_group: dict[str, float],
) -> ArrivalEstimate | None:
    """Reparte lo que se va a pedir de cada tipo entre sus rangos, según la historia reciente."""
    rates = arrival_rates(history, group_of)
    if rates is None:
        return None
    expected: dict[str, int] = {}
    expected_a: dict[str, int] = {}
    for product, group in group_of.items():
        expected[product], expected_a[product] = rates.expect(
            product, request_by_group.get(group, 0.0)
        )
    return ArrivalEstimate(expected, expected_a, rates.days, rates.date_from, rates.date_to)


# Días recientes en los que se comprueba el modelo contra lo que de verdad llegó.
CHECK_DAYS = 14


@dataclass(frozen=True)
class ArrivalCheck:
    """Un día ya ocurrido: lo que el modelo habría dicho la víspera contra lo que llegó."""

    date: date
    ordered: dict[str, float]
    expected: dict[str, int]
    produced: dict[str, int]

    def _error(self, guess: dict[str, float] | dict[str, int]) -> float:
        total = sum(self.produced.values())
        missed = sum(abs(guess.get(p, 0) - n) for p, n in self.produced.items())
        return missed / total if total else 0.0

    @property
    def error(self) -> float:
        """Aves mal ubicadas de rango por cada ave que llegó (0 = acierto total)."""
        return self._error(self.expected)

    @property
    def naive_error(self) -> float:
        """El mismo error si se supone que llega justo lo pedido en cada rango."""
        return self._error(self.ordered)


def check_arrival(history: list[DailyProduction], group_of: dict[str, str]) -> list[ArrivalCheck]:
    """Repite la estimación para cada uno de los últimos días usando solo los anteriores."""
    usable = _usable(history)
    checks = []
    for index in range(max(MIN_HISTORY_DAYS, len(usable) - CHECK_DAYS), len(usable)):
        rates = arrival_rates(usable[:index], group_of)
        if rates is None:
            continue
        day = usable[index]
        lines = [line for line in day.lines if line.product_id in group_of]
        asked: dict[str, float] = {}
        for line in lines:
            group = group_of[line.product_id]
            asked[group] = asked.get(group, 0.0) + line.ordered
        checks.append(
            ArrivalCheck(
                day.date,
                {line.product_id: line.ordered for line in lines},
                {p: rates.expect(p, asked.get(g, 0.0))[0] for p, g in group_of.items()},
                dict.fromkeys(group_of, 0) | {line.product_id: line.produced for line in lines},
            )
        )
    return checks


def overall_error(checks: list[ArrivalCheck], *, naive: bool = False) -> float:
    """Error de todos los días juntos (pesa más el día en que llegaron más aves)."""
    total = sum(sum(c.produced.values()) for c in checks)
    missed = sum((c.naive_error if naive else c.error) * sum(c.produced.values()) for c in checks)
    return missed / total if total else 0.0
