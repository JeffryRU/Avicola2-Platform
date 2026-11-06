"""Contratos JSON de la API de planificación (adaptador de entrada)."""

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=200)
    # Recordarme: cookie persistente (hasta que venza el token); si no, se borra al cerrar.
    remember: bool = False


class SellerOut(BaseModel):
    username: str
    name: str
    zone: str | None
    role: str


class AccountOut(BaseModel):
    """La sesión no viaja en el cuerpo: el token va solo en la cookie HttpOnly."""

    seller: SellerOut
    must_change_password: bool


class TokenLoginIn(BaseModel):
    """Login de la app móvil (sin cookie ni "recordarme": el token dura lo que dura)."""

    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=200)


class TokenOut(AccountOut):
    """Solo para la app móvil: el navegador nunca recibe el token en el cuerpo."""

    token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 (tipo de token, no un secreto)
    expires_in: int = Field(description="Segundos hasta que vence el token.")


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)
    remember: bool = False


class AdminAccountOut(BaseModel):
    username: str
    name: str
    zone: str | None
    role: str
    is_active: bool
    must_change_password: bool
    locked_until: datetime | None


class CreateAccountIn(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    name: str = Field(min_length=1, max_length=100)
    zone: str | None = Field(None, max_length=50)
    role: str = Field("seller", max_length=20)


class NewCredentialsOut(BaseModel):
    """La contraseña temporal se muestra una sola vez; no se puede volver a consultar."""

    account: AdminAccountOut
    temporary_password: str


class SetActiveIn(BaseModel):
    active: bool


class ProductOut(BaseModel):
    id: str
    category: str
    name: str
    kg_per_unit: float
    sort_order: int
    subcategory: str | None = None


class ProjectionOut(BaseModel):
    id: UUID
    submission_id: UUID
    seller: str
    date: date
    category: str
    status: str
    total_units: int
    total_kg: float
    submitted_at: datetime
    units: dict[str, int]


class DayIn(BaseModel):
    date: date
    units: dict[str, int]


class SubmissionIn(BaseModel):
    """`submission_id` lo genera el cliente: reenviar un envío (cola offline) es idempotente."""

    submission_id: UUID | None = None
    category: str = Field(min_length=1, max_length=30)
    days: list[DayIn] = Field(min_length=1)
    # Solo el supervisor: el vendedor de la proyección. Para un vendedor sale de la sesión.
    seller: str | None = Field(default=None, max_length=50)


class SubmissionOut(BaseModel):
    submission_id: UUID
    days: int
    total_units: int
    total_kg: float


class DailyUnitsOut(BaseModel):
    seller: str
    date: date
    units: dict[str, int]


class SuggestionOut(BaseModel):
    method: str
    days: list[DailyUnitsOut]


StatusOut = dict[str, Any]


class NotificationOut(BaseModel):
    id: int
    kind: str
    title: str
    body: str
    link: str | None
    created_at: datetime
    read_at: datetime | None


class NotificationsOut(BaseModel):
    items: list[NotificationOut]
    unread: int


class MarkReadIn(BaseModel):
    """Sin `ids` se marcan todas como leídas."""

    ids: list[int] | None = Field(None, max_length=200)


class MarkReadOut(BaseModel):
    updated: int


class AnnouncementIn(BaseModel):
    """Aviso de n8n. `audience`: all | sellers | supervisors | un usuario."""

    audience: str = Field("all", min_length=1, max_length=50)
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=500)
    link: str | None = Field(None, max_length=200, pattern=r"^/[^\s]*$")


class CreatedOut(BaseModel):
    created: int


# --- Hora de corte y habilitaciones ----------------------------------------------------


class UnlockOut(BaseModel):
    id: int
    seller: str
    date: date
    reason: str
    status: str
    requested_at: datetime
    decided_by: str | None
    decided_at: datetime | None


class EditingDayOut(BaseModel):
    date: date
    closes_at: datetime
    open: bool
    unlock: UnlockOut | None


class CutoffOut(BaseModel):
    cutoff_time: str
    days_before: int
    open_days: int


class EditingWindowOut(BaseModel):
    policy: CutoffOut
    days: list[EditingDayOut]


class UnlockRequestIn(BaseModel):
    date: date
    reason: str = Field(min_length=1, max_length=300)


class UnlockDecisionIn(BaseModel):
    action: Literal["approve", "reject", "close"]


class CutoffIn(BaseModel):
    cutoff_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    days_before: int = Field(ge=0, le=7)


class ChangeOut(BaseModel):
    id: int
    seller: str
    date: date
    category: str
    author: str
    action: str
    before: dict[str, int] | None
    after: dict[str, int]
    before_total: int | None
    after_total: int
    after_cutoff: bool
    changed_at: datetime
