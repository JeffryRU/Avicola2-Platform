"""Stock de despacho: lo que queda en despacho de un día, por producto, lote y ubicación.

Lo registra el jefe de despacho. El lote es la fecha de beneficio. Para calcular cuánto pedir a
granja solo cuenta el stock de lotes recientes: lo más antiguo se troza y ya no es pollo entero.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.planning.domain.dates import check_recent_day
from app.shared.domain.errors import DomainError

# Días hacia atrás que se pueden registrar o corregir (hoy incluido). Nunca días futuros:
# el stock es lo que ya quedó, no una estimación.
STOCK_BACK_DAYS = 7
MAX_UNITS = 1_000_000
# Un lote no puede ser posterior al día del stock ni más antiguo que esto (el pollo dura ~8 días).
MAX_LOT_AGE_DAYS = 15
# Ubicación del stock cuando no se configuran otras (STOCK_LOCATIONS) y en datos antiguos.
DEFAULT_LOCATION = "General"


@dataclass(frozen=True)
class StockLine:
    product_id: str
    units: int
    kg: float
    location: str = DEFAULT_LOCATION
    # Fecha de beneficio del lote (None en datos antiguos: se toma el día del stock).
    lot_date: date | None = None


@dataclass(frozen=True)
class DailyStock:
    """Stock registrado de un día: una línea por producto, lote y ubicación."""

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

    def units_by_product(self, lot_days: int | None = None) -> dict[str, int]:
        """Unidades por producto sumando ubicaciones. Con `lot_days`, solo los lotes de hasta
        esos días de antigüedad respecto al día del stock."""
        oldest = self.date - timedelta(days=lot_days) if lot_days is not None else None
        totals: dict[str, int] = {}
        for line in self.lines:
            if oldest is not None and (line.lot_date or self.date) < oldest:
                continue
            totals[line.product_id] = totals.get(line.product_id, 0) + line.units
        return totals


def check_stock_date(day: date, today: date) -> None:
    check_recent_day(day, today, STOCK_BACK_DAYS, "el stock")


def check_lot_date(lot: date, day: date) -> None:
    if lot > day:
        raise DomainError("Un lote no puede ser posterior al día del stock.")
    if lot < day - timedelta(days=MAX_LOT_AGE_DAYS):
        raise DomainError(f"Un lote no puede tener más de {MAX_LOT_AGE_DAYS} días.")


def stock_locations(configured: list[str]) -> list[str]:
    """Ubicaciones del stock: «General» y las configuradas (STOCK_LOCATIONS). Todo se almacena en
    un solo lugar, así que las zonas de los vendedores no separan el stock (INS-10): sin nada
    configurado solo está «General» y la app no muestra el filtro de ubicación."""
    seen: dict[str, str] = {}
    for place in [DEFAULT_LOCATION, *configured]:
        seen.setdefault(place.casefold(), place)
    return list(seen.values())
