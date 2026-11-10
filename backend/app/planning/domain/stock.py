"""Stock de despacho: lo que queda en despacho de un día, por producto (Python puro).

Lo registra el jefe de despacho. Es lo que se resta al calcular cuánto pedir a granja.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.shared.domain.errors import DomainError

# Días hacia atrás que se pueden registrar o corregir (hoy incluido). Nunca días futuros:
# el stock es lo que ya quedó, no una estimación.
STOCK_BACK_DAYS = 7
MAX_UNITS = 1_000_000
MAX_KG = 10_000_000.0


@dataclass(frozen=True)
class StockLine:
    product_id: str
    units: int
    kg: float


@dataclass(frozen=True)
class DailyStock:
    """Stock registrado de un día: una línea por producto."""

    date: date
    lines: tuple[StockLine, ...]
    recorded_by: str
    recorded_at: datetime

    @property
    def total_units(self) -> int:
        return sum(line.units for line in self.lines)

    @property
    def total_kg(self) -> float:
        return round(sum(line.kg for line in self.lines), 2)


def check_stock_date(day: date, today: date) -> None:
    if day > today:
        raise DomainError("No se puede registrar el stock de un día que aún no llega.")
    if day < today - timedelta(days=STOCK_BACK_DAYS):
        raise DomainError(
            f"Solo se puede registrar o corregir el stock de los últimos {STOCK_BACK_DAYS} días."
        )
