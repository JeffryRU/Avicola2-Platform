"""Historial de cambios de las proyecciones (Python puro)."""

from dataclasses import dataclass
from datetime import date, datetime

# Acción del cambio (varchar validado por la app, no ENUM).
CREATED, UPDATED = "created", "updated"
ACTIONS = (CREATED, UPDATED)


@dataclass(frozen=True)
class ProjectionChange:
    """Quién creó o modificó la proyección de un vendedor para un día, y qué cambió."""

    seller: str
    date: date
    category: str
    author: str
    action: str
    before: dict[str, int] | None
    after: dict[str, int]
    changed_at: datetime
    # Se hizo pasada la hora de corte (con habilitación o por el supervisor).
    after_cutoff: bool = False
    id: int | None = None
    # Número de la hoja de registro que dejó este cambio (None en cambios anteriores a las hojas).
    sheet: int | None = None

    @property
    def before_total(self) -> int | None:
        return None if self.before is None else sum(self.before.values())

    @property
    def after_total(self) -> int:
        return sum(self.after.values())
