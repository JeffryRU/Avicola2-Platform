"""Entidades de la planificación de demanda. Python puro: sin frameworks ni base de datos."""

from dataclasses import dataclass, field
from datetime import date, datetime
from uuid import UUID

CONFIRMED = "confirmed"


@dataclass(frozen=True)
class Product:
    id: str
    category: str
    name: str
    kg_per_unit: float
    sort_order: int = 0

    def kg(self, units: int) -> float:
        return round(units * self.kg_per_unit, 2)


@dataclass(frozen=True)
class Seller:
    username: str
    name: str
    zone: str | None = None


@dataclass(frozen=True)
class SellerAccount:
    seller: Seller
    password_hash: str


@dataclass(frozen=True)
class ProjectionLine:
    product_id: str
    units: int
    kg: float


@dataclass(frozen=True)
class Projection:
    """Proyección de un vendedor para un día y una categoría (única por esa terna)."""

    id: UUID
    submission_id: UUID
    seller: str
    date: date
    category: str
    lines: tuple[ProjectionLine, ...]
    submitted_at: datetime
    status: str = CONFIRMED

    @property
    def total_units(self) -> int:
        return sum(line.units for line in self.lines)

    @property
    def total_kg(self) -> float:
        return round(sum(line.kg for line in self.lines), 2)

    @property
    def units(self) -> dict[str, int]:
        return {line.product_id: line.units for line in self.lines}


@dataclass(frozen=True)
class DailyUnits:
    """Unidades por producto de un vendedor en un día (venta real o sugerencia)."""

    seller: str
    date: date
    units: dict[str, int] = field(default_factory=dict)
