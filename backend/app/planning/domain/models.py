"""Entidades de la planificación de demanda. Python puro: sin frameworks ni base de datos."""

from dataclasses import dataclass, field
from datetime import date, datetime
from uuid import UUID

CONFIRMED = "confirmed"
# Roles (varchar validado por la app, no ENUM). El supervisor administra cuentas y ve a todos.
SELLER, SUPERVISOR = "seller", "supervisor"
ROLES = (SELLER, SUPERVISOR)


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
    role: str = SELLER

    @property
    def is_supervisor(self) -> bool:
        return self.role == SUPERVISOR


@dataclass(frozen=True)
class SellerAccount:
    """Cuenta con sus datos de seguridad. `token_version` invalida las sesiones abiertas
    al cambiarse (cambio o reseteo de contraseña, desactivación)."""

    seller: Seller
    password_hash: str
    must_change_password: bool = False
    failed_logins: int = 0
    locked_until: datetime | None = None
    token_version: int = 0
    is_active: bool = True

    def is_locked(self, now: datetime) -> bool:
        return self.locked_until is not None and self.locked_until > now


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
