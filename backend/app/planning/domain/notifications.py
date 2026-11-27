"""Notificaciones por usuario y eventos en tiempo real (Python puro)."""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from app.planning.domain.permissions import ROLES, SELLER, Permission, roles_with

# Tipos de notificación (varchar validado por la app).
PROJECTION_REMINDER = "projection_reminder"  # recordatorio: falta la proyección de hoy (n8n)
PROJECTION_SUBMITTED = "projection_submitted"  # al supervisor: un vendedor envió su proyección
ANNOUNCEMENT = "announcement"  # aviso general (n8n): ventas actualizadas, catálogo, etc.
EDIT_REQUESTED = "edit_requested"  # al supervisor: un vendedor pide editar un día cerrado
EDIT_DECIDED = "edit_decided"  # al vendedor: su solicitud se aprobó, rechazó o se volvió a cerrar
# Pasó la hora de corte sin proyección: al vendedor que no registró y, con la lista, al supervisor.
PROJECTION_MISSED = "projection_missed"
KINDS = (
    PROJECTION_REMINDER,
    PROJECTION_SUBMITTED,
    ANNOUNCEMENT,
    EDIT_REQUESTED,
    EDIT_DECIDED,
    PROJECTION_MISSED,
)

# Eventos del canal en tiempo real. Solo avisan que algo cambió: los datos se piden por la API.
NOTIFICATION_CREATED = "notification"
PROJECTIONS_CHANGED = "projections.changed"
EDITING_CHANGED = "editing.changed"  # hora de corte o habilitaciones
SESSION_REVOKED = "session.revoked"

# Pantallas de la app a las que lleva un aviso (rutas del frontend y de la app móvil).
REGISTER_LINK = "/registrar"
UNLOCKS_LINK = "/habilitaciones"
HISTORY_LINK = "/historial"
TEAM_STATUS_LINK = "/dashboards/estado"
DAY_DASHBOARD_LINK = "/dashboards/dia"


def register_day_link(day: date) -> str:
    """Pantalla de registro abierta en ese día."""
    return f"{REGISTER_LINK}?dia={day.isoformat()}"


def day_dashboard_link(day: date) -> str:
    """Tablero del equipo para ese día."""
    return f"{DAY_DASHBOARD_LINK}/{day.isoformat()}"


# A quién va un aviso general.
AUDIENCES = {
    "all": ROLES,
    "sellers": (SELLER,),
    "supervisors": roles_with(Permission.VIEW_TEAM),
}


@dataclass(frozen=True)
class Notification:
    recipient: str
    kind: str
    title: str
    body: str
    created_at: datetime
    link: str | None = None
    # Evita duplicados del mismo aviso (p. ej., un recordatorio por día).
    dedupe_key: str | None = None
    read_at: datetime | None = None
    id: int | None = None


@dataclass(frozen=True)
class Audience:
    """Destinatarios de un evento: usuarios concretos o roles completos."""

    usernames: frozenset[str] = frozenset()
    roles: frozenset[str] = frozenset()

    @classmethod
    def users(cls, *usernames: str) -> "Audience":
        return cls(usernames=frozenset(usernames))

    @classmethod
    def role(cls, *roles: str) -> "Audience":
        return cls(roles=frozenset(roles))

    def includes(self, username: str, role: str) -> bool:
        return username in self.usernames or role in self.roles


@dataclass(frozen=True)
class Event:
    type: str
    audience: Audience
    data: dict[str, Any] = field(default_factory=dict)
