"""Notificaciones por usuario y eventos en tiempo real (Python puro)."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.planning.domain.models import SELLER, SUPERVISOR

# Tipos de notificación (varchar validado por la app).
PROJECTION_REMINDER = "projection_reminder"  # recordatorio: falta la proyección de hoy (n8n)
PROJECTION_SUBMITTED = "projection_submitted"  # al supervisor: un vendedor envió su proyección
ANNOUNCEMENT = "announcement"  # aviso general (n8n): ventas actualizadas, catálogo, etc.
KINDS = (PROJECTION_REMINDER, PROJECTION_SUBMITTED, ANNOUNCEMENT)

# Eventos del canal en tiempo real. Solo avisan que algo cambió: los datos se piden por la API.
NOTIFICATION_CREATED = "notification"
PROJECTIONS_CHANGED = "projections.changed"
SESSION_REVOKED = "session.revoked"

# A quién va un aviso general.
AUDIENCES = {"all": (SELLER, SUPERVISOR), "sellers": (SELLER,), "supervisors": (SUPERVISOR,)}


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
