"""Contratos JSON de la API de planificación (adaptador de entrada)."""

from datetime import date, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.planning.domain.accounts import MAX_NAME
from app.planning.domain.assistant import MAX_MESSAGE as MAX_ASSISTANT_MESSAGE
from app.planning.domain.editing import CUTOFF_PATTERN, MAX_DAYS_BEFORE, MAX_REASON, Decision
from app.planning.domain.models import QUALITY_A
from app.planning.domain.permissions import SELLER
from app.planning.domain.production import MAX_BIRDS
from app.planning.domain.saca import MAX_PLUS
from app.planning.domain.stock import MAX_UNITS
from app.shared.infrastructure.http.params import DbId


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
    # Resueltos por el backend (domain/permissions.py): los clientes no repiten las reglas.
    permissions: list[str]
    manageable_roles: list[str] = Field(
        description="Roles de las cuentas que esta persona puede crear y gestionar."
    )


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
    # Lo que puede hacer con esta cuenta quien la consulta (calculado por el backend).
    can_manage: bool
    assignable_roles: list[str] = Field(
        description="Roles a los que quien consulta puede cambiar esta cuenta (vacío: ninguno)."
    )


class CreateAccountIn(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    name: str = Field(min_length=1, max_length=MAX_NAME)
    zone: str | None = Field(None, max_length=50)
    role: str = Field(SELLER, max_length=20)


class EditAccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=MAX_NAME)
    zone: str | None = Field(None, max_length=50)


class NewCredentialsOut(BaseModel):
    """La contraseña temporal se muestra una sola vez; no se puede volver a consultar."""

    account: AdminAccountOut
    temporary_password: str


class SetActiveIn(BaseModel):
    active: bool


class ChangeRoleIn(BaseModel):
    role: str = Field(min_length=1, max_length=20)


class ProductOut(BaseModel):
    id: str
    category: str
    name: str
    kg_per_unit: float
    sort_order: int
    subcategory: str | None = None
    quality: str = Field(default=QUALITY_A, description="A, o B (calidad B: solo en el stock).")
    projected: bool = Field(
        default=True, description="Lo registran los vendedores en sus proyecciones."
    )


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
    sheet: int = Field(
        description="Hoja de registro vigente: 1 la primera, 2 si se registró de nuevo…"
    )


class DayIn(BaseModel):
    date: date
    units: dict[str, int]


class SubmissionIn(BaseModel):
    """`submission_id` lo genera el cliente: reenviar un envío (cola offline) es idempotente."""

    submission_id: UUID | None = None
    category: str = Field(min_length=1, max_length=30)
    days: list[DayIn] = Field(min_length=1)
    # El vendedor sale de la sesión. Se acepta por compatibilidad: si no es él mismo, 403.
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


class StoreOrderDayOut(BaseModel):
    zone: str | None
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

    ids: list[DbId] | None = Field(None, max_length=200)


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
    # Primer día de la ventana (1 = mañana) y si el bloqueo por horario está activo.
    starts_in: int
    enabled: bool


class EditingWindowOut(BaseModel):
    policy: CutoffOut
    days: list[EditingDayOut]


class UnlockRequestIn(BaseModel):
    date: date
    reason: str = Field(min_length=1, max_length=MAX_REASON)


class UnlockDecisionIn(BaseModel):
    action: Decision


class CutoffIn(BaseModel):
    cutoff_time: str = Field(pattern=CUTOFF_PATTERN)
    days_before: int = Field(ge=0, le=MAX_DAYS_BEFORE)
    enabled: bool = True


class GrantEditingIn(BaseModel):
    """Días que el supervisor habilita para un vendedor."""

    dates: list[date] = Field(min_length=1, max_length=31)


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
    sheet: int | None


# --- Stock de despacho -------------------------------------------------------------------


class StockLineIn(BaseModel):
    product_id: str = Field(min_length=1, max_length=10)
    units: int = Field(ge=0, le=MAX_UNITS)
    lot_date: date | None = Field(
        default=None, description="Fecha de beneficio del lote; sin ella, el día del stock."
    )
    # Se aceptaba antes; ahora los kg se calculan siempre con el peso del producto.
    kg: float | None = Field(default=None, ge=0, le=10_000_000, deprecated=True)


class StockIn(BaseModel):
    lines: list[StockLineIn] = Field(min_length=1, max_length=2000)
    location: str | None = Field(
        default=None,
        max_length=60,
        description="Ubicación que se registra (reemplaza solo esa); sin ella, la primera.",
    )


class StockLineOut(BaseModel):
    product_id: str
    units: int
    kg: float
    location: str
    lot_date: date


class StockOptionsOut(BaseModel):
    """Con qué se arma el formulario de stock."""

    items: list[ProductOut] = Field(description="Artículos del stock, incluida la calidad B.")
    locations: list[str]
    lot_days: int = Field(
        description="Antigüedad máxima (días) de los lotes que descuenta la saca."
    )


class StockDayOut(BaseModel):
    date: date
    lines: list[StockLineOut]
    total_units: int
    total_kg: float
    recorded_by: str
    recorded_at: datetime


# --- Cálculo de saca ----------------------------------------------------------------------


class SacaLineOut(BaseModel):
    product_id: str
    projected: int
    ordered: int
    demand: int = Field(
        description="stock − pedidos + proyección del producto, sin plus (puede ser negativo)."
    )
    stock: int
    request: int = Field(description="Lo de `demand`, nunca menos de 0 (sin plus).")
    request_kg: float
    expected: int | None = Field(
        description="Aves que se espera que lleguen en este rango (null: sin historia suficiente)."
    )
    expected_a: int | None = Field(description="De las esperadas, cuántas en calidad A.")


class SacaForecastOut(BaseModel):
    """Con qué se estimó la llegada por rango."""

    method: str
    days: int
    date_from: date
    date_to: date


class SacaGroupOut(BaseModel):
    """Un tipo de pedido a granja: stock − pedidos + proyección + plus = pedido final."""

    name: str
    stock: int
    stock_b: int = Field(description="De ese stock, cuánto es calidad B.")
    ordered: int = Field(description="Pedidos de mañana.")
    projected: int = Field(description="Proyección de pasado mañana.")
    plus: int = Field(description="Aves extra fijas del tipo.")
    b_rate: float | None = Field(
        None, description="Parte de lo que llega del tipo que sale en calidad B (historia)."
    )
    suggested_plus: int | None = Field(
        None, description="Plus que cubre la calidad B esperada; null sin historia o si no aplica."
    )
    balance: int = Field(description="stock − pedidos + proyección, antes del plus.")
    farm_order: int = Field(description="balance + plus, nunca menos de 0.")
    # Compatibilidad con clientes anteriores (app móvil): ya no hay factor ni «falta».
    demand: int = Field(description="Igual a `balance` (compatibilidad).")
    need: int = Field(description="Igual a `farm_order` (compatibilidad).")
    factor: float = Field(1.0, description="Siempre 1 (compatibilidad; reemplazado por plus).")


class SacaPlusIn(BaseModel):
    plus: dict[str, Annotated[int, Field(ge=0, le=MAX_PLUS)]] = Field(
        min_length=1,
        max_length=20,
        description="Aves extra por tipo, p. ej. {'Brasa chica': 4000}. Lo que falte queda en 0.",
    )


class SacaPlusOut(BaseModel):
    plus: dict[str, int]


class SacaOut(BaseModel):
    """Saca calculada el día `date` (hoy)."""

    date: date
    orders_date: date = Field(description="Día de los pedidos que se restan (mañana).")
    projection_date: date = Field(description="Día de la proyección que se suma (pasado mañana).")
    lines: list[SacaLineOut]
    projected: int
    ordered: int
    demand: int = Field(description="stock − pedidos + proyección, sin plus.")
    stock: int
    plus: int = Field(description="Suma del plus de los tipos.")
    request: int
    request_kg: float
    live_kg: float = Field(description="Kg vivos estimados (kg de producto entre el rendimiento).")
    yield_factor: float
    method: str = Field(description="Forma de cálculo: stock − pedidos + proyección + plus.")
    farm_order: int = Field(description="Aves del pedido final a granja (suma de los tipos).")
    stock_b: int = Field(description="Stock de calidad B descontado (por tipo).")
    stock_old: int = Field(description="Stock en lotes antiguos, que no se descuenta.")
    stock_lot_days: int | None = Field(description="Antigüedad máxima de los lotes que cuentan.")
    groups: list[SacaGroupOut] = Field(description="Pedido final a granja por tipo.")
    stock_date: date | None = Field(
        description="Día del stock descontado; null si no hay reciente."
    )
    sellers_registered: int
    sellers_total: int
    orders_available: bool = Field(description="False: no hay pedidos cargados para mañana.")
    forecast: SacaForecastOut | None = Field(
        description="Estimación de llegada por rango; null si falta historia de producción."
    )
    saved_at: datetime | None = Field(
        default=None, description="Cuándo se guardó esta saca (la de un día pasado es la guardada)."
    )
    saved_by: str | None = Field(default=None, description="Quién la vio o «sistema» (cierre).")


class SacaHistoryGroupOut(BaseModel):
    name: str
    projected: int
    ordered: int
    stock: int
    plus: int
    farm_order: int


class SacaHistoryOut(BaseModel):
    """Una saca guardada: el pedido a granja de ese día, por tipo."""

    date: date
    saved_at: datetime
    saved_by: str
    farm_order: int
    groups: list[SacaHistoryGroupOut]


# --- Producción diaria --------------------------------------------------------------------


class ProductionLineIn(BaseModel):
    product_id: str = Field(min_length=1, max_length=10)
    ordered: float = Field(default=0, ge=0, le=MAX_BIRDS)
    produced: int = Field(ge=0, le=MAX_BIRDS)
    quality_b: int = Field(default=0, ge=0, le=MAX_BIRDS)


class ProductionIn(BaseModel):
    lines: list[ProductionLineIn] = Field(min_length=1, max_length=200)
    weights: dict[str, float] = Field(
        default_factory=dict,
        max_length=20,
        description="Peso vivo promedio (kg) de la parvada por tipo, p. ej. {'Brasa chica': 1.72}.",
    )


class ProductionLineOut(BaseModel):
    product_id: str
    ordered: float
    produced: int
    quality_a: int
    quality_b: int


class ProductionDayOut(BaseModel):
    date: date
    lines: list[ProductionLineOut]
    ordered: float
    produced: int
    quality_b: int
    weights: dict[str, float]
    recorded_by: str
    recorded_at: datetime


class ForecastProductOut(BaseModel):
    product_id: str
    share: float = Field(description="Aves que llegan de este rango por cada ave pedida del tipo.")
    quality_a_rate: float = Field(description="Parte de esas aves que sale en calidad A (0 a 1).")


class ForecastGroupOut(BaseModel):
    name: str
    last_ordered: float = Field(description="Lo último que se pidió a granja de este tipo.")
    last_weight: float | None = Field(description="Último peso promedio anotado (kg).")
    products: list[ForecastProductOut]


class ForecastCheckOut(BaseModel):
    date: date
    error: float
    naive_error: float


class ForecastProductCheckOut(BaseModel):
    product_id: str
    ordered: float
    expected: int
    produced: int


class ForecastAccuracyOut(BaseModel):
    """Comprobación sobre días ya ocurridos: cada uno se estimó solo con los anteriores."""

    days: int
    error: float = Field(description="Aves mal ubicadas de rango por cada ave que llegó.")
    naive_error: float = Field(description="El mismo error suponiendo que llega lo pedido.")
    by_day: list[ForecastCheckOut]
    by_product: list[ForecastProductCheckOut]


class ForecastCandidateOut(BaseModel):
    name: str
    error: float


class ArrivalForecastOut(BaseModel):
    available: bool = Field(description="false si aún falta historia de producción.")
    method: str = Field(description="Modelo en uso: ewma_<vida media> o hybrid_weight.")
    candidates: list[ForecastCandidateOut] = Field(
        description="Modelos que compitieron y su error en los últimos días."
    )
    weights_used: dict[str, float] = Field(
        description="Peso de la parvada con que se estimó; vacío si el modelo no lo usa."
    )
    min_days: int
    days: int
    date_from: date | None
    date_to: date | None
    groups: list[ForecastGroupOut]
    accuracy: ForecastAccuracyOut | None


class AssistantOut(BaseModel):
    """Si hay asistente y con qué preguntas empezar (según lo que la persona puede ver)."""

    enabled: bool
    suggestions: list[str]


class AssistantMessageIn(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_ASSISTANT_MESSAGE)
    # Lo elige la app (un UUID) y lo mantiene mientras dura la conversación.
    conversation: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9-]+$")


class AssistantReplyOut(BaseModel):
    reply: str
    suggestions: list[str]
    # Mensaje guardado en el historial y la respuesta en bloques de texto y de tabla (ADR 0024).
    message_id: str | None = None
    blocks: list[dict[str, Any]] = []


class ConversationSummaryOut(BaseModel):
    id: str
    title: str
    channel: str
    updated_at: datetime
    preview: str


class StoredMessageOut(BaseModel):
    id: str
    role: str
    text: str
    blocks: list[dict[str, Any]]
    suggestions: list[str]
    created_at: datetime


class ConversationOut(BaseModel):
    id: str
    title: str
    channel: str
    messages: list[StoredMessageOut]


class LinkCodeOut(BaseModel):
    code: str
    expires_at: datetime


class ChannelMessageIn(BaseModel):
    channel: str = Field(min_length=1, max_length=10)
    sender: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=4000)


# El campo `date` de ExtractionIn tapa el tipo `date` dentro de la clase.
DateOrNone = date | None


class ExtractedRowIn(BaseModel):
    product: str = Field(max_length=120)
    units: int | None = Field(None, ge=0, le=1_000_000)
    kg: float | None = Field(None, ge=0, le=10_000_000)
    lot_date: date | None = None


class ExtractionIn(BaseModel):
    kind: str = Field(max_length=15)
    date: DateOrNone = None
    rows: list[ExtractedRowIn] = Field(default_factory=list, max_length=200)
    notes: str = Field("", max_length=1000)


class ChannelPhotoIn(BaseModel):
    channel: str = Field(min_length=1, max_length=10)
    sender: str = Field(min_length=1, max_length=64)
    extraction: ExtractionIn


class ChannelFileOut(BaseModel):
    name: str
    url: str


class ChannelReplyOut(BaseModel):
    text: str
    files: list[ChannelFileOut]
    suggestions: list[str]


class ChannelProductOut(BaseModel):
    id: str
    name: str
    category: str
    unit: str


class ChannelContextOut(BaseModel):
    linked: bool
    name: str = ""
    can_project: bool = False
    can_stock: bool = False
    today: date | None = None
    dates: list[date] = []
    products: list[ChannelProductOut] = []
