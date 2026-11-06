"""Hora de corte y habilitaciones de edición (Python puro).

Regla (configurable por el supervisor, ver docs/assumptions.md): la proyección de un día D se
puede registrar o editar hasta la hora de corte de D menos `days_before` días. Pasada esa hora,
el vendedor necesita una habilitación del supervisor, que pide indicando el motivo (o que el
supervisor le da directamente). El supervisor puede apagar el bloqueo por horario.
"""

import re
from dataclasses import dataclass, replace
from datetime import date, datetime, time, timedelta, tzinfo

from app.shared.domain.errors import ConflictError, DomainError

# Estados de una habilitación (varchar validado por la app, no ENUM).
REQUESTED, APPROVED, REJECTED, CLOSED = "requested", "approved", "rejected", "closed"
UNLOCK_STATUSES = (REQUESTED, APPROVED, REJECTED, CLOSED)
# Lo que puede hacer el supervisor con una habilitación y a qué estado la lleva.
DECISIONS = {
    "approve": (REQUESTED, APPROVED),
    "reject": (REQUESTED, REJECTED),
    "close": (APPROVED, CLOSED),
}

MAX_REASON = 300
MAX_DAYS_BEFORE = 7
_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def parse_cutoff(value: str) -> time:
    """Convierte "07:00" en time(7, 0). Lanza DomainError si no es una hora HH:MM válida."""
    match = _HHMM.match(value.strip())
    if not match:
        raise DomainError("La hora de corte debe tener el formato HH:MM (por ejemplo, 07:00).")
    return time(int(match[1]), int(match[2]))


def clean_reason(reason: str) -> str:
    cleaned = " ".join(reason.split())
    if not cleaned:
        raise DomainError("Indica el motivo de la solicitud.")
    if len(cleaned) > MAX_REASON:
        raise DomainError(f"El motivo puede tener como máximo {MAX_REASON} caracteres.")
    return cleaned


@dataclass(frozen=True)
class CutoffPolicy:
    """Hasta cuándo se edita cada día y qué días se pueden registrar.

    `starts_in`: el primer día de la ventana (0 = hoy, 1 = mañana); `open_days`: cuántos días
    tiene. `enabled`: si el bloqueo por horario está activo (apagado, todo día de la ventana
    queda abierto).
    """

    cutoff: time
    days_before: int = 0
    open_days: int = 3
    starts_in: int = 0
    enabled: bool = True

    def __post_init__(self) -> None:
        if not 0 <= self.days_before <= MAX_DAYS_BEFORE:
            raise DomainError(f"Los días de anticipación deben estar entre 0 y {MAX_DAYS_BEFORE}.")
        if self.open_days < 1:
            raise DomainError("Debe poder registrarse al menos un día.")
        if self.starts_in < 0:
            raise DomainError("La ventana no puede empezar en el pasado.")

    def closes_at(self, day: date, tz: tzinfo | None) -> datetime:
        return datetime.combine(day - timedelta(days=self.days_before), self.cutoff, tzinfo=tz)

    def first_day(self, today: date) -> date:
        return today + timedelta(days=self.starts_in)

    def last_day(self, today: date) -> date:
        return self.first_day(today) + timedelta(days=self.open_days - 1)

    def window(self, today: date) -> list[date]:
        """Días que se pueden registrar: desde `first_day` (mañana), `open_days` días."""
        first = self.first_day(today)
        return [first + timedelta(days=i) for i in range(self.open_days)]

    def is_open(self, day: date, now: datetime) -> bool:
        return not self.enabled or now < self.closes_at(day, now.tzinfo)

    def closed_recently(self, today: date, now: datetime, within: timedelta) -> list[date]:
        """Días cuyo corte pasó hace menos de `within` (para avisar quién no registró)."""
        if not self.enabled:
            return []
        candidates = (today + timedelta(days=i) for i in range(-1, self.days_before + 2))
        return [d for d in candidates if now - within < self.closes_at(d, now.tzinfo) <= now]


@dataclass(frozen=True)
class EditUnlock:
    """Solicitud de un vendedor para editar un día ya cerrado, y la decisión del supervisor."""

    seller: str
    date: date
    reason: str
    status: str
    requested_at: datetime
    decided_by: str | None = None
    decided_at: datetime | None = None
    id: int | None = None

    @property
    def is_open(self) -> bool:
        return self.status == APPROVED

    @property
    def is_pending(self) -> bool:
        return self.status == REQUESTED

    def decide(self, action: str, by: str, at: datetime) -> "EditUnlock":
        """Aprobar o rechazar una solicitud, o volver a cerrar una habilitación aprobada."""
        if action not in DECISIONS:
            raise DomainError("Acción no válida.")
        source, target = DECISIONS[action]
        if self.status != source:
            raise ConflictError("La solicitud ya no está en un estado que permita esa acción.")
        return replace(self, status=target, decided_by=by, decided_at=at)
