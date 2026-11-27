"""Puertos de salida: lo que los casos de uso necesitan del exterior.

Los adaptadores de infrastructure/ los implementan; la aplicación nunca los importa.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Protocol
from uuid import UUID

from app.planning.domain.accounts import AccountChange, ChangeOutcome
from app.planning.domain.channels import Draft
from app.planning.domain.conversations import Conversation, ConversationSummary, StoredMessage
from app.planning.domain.editing import EditUnlock
from app.planning.domain.history import ProjectionChange
from app.planning.domain.models import DailyUnits, Product, Projection, Seller, SellerAccount
from app.planning.domain.notifications import Event, Notification
from app.planning.domain.orders import OrderLine
from app.planning.domain.preferences import Preferences
from app.planning.domain.production import DailyProduction, FittedArrival
from app.planning.domain.saca import SacaSnapshot
from app.planning.domain.stock import DailyStock


class ProductRepository(Protocol):
    def list_active(self) -> list[Product]: ...

    def list_stock_items(self) -> list[Product]:
        """Incluye los artículos de calidad B, que solo se cuentan en el stock."""
        ...


class SellerRepository(Protocol):
    """Cuentas de usuario. Hoy en la base de la app; cuando la app sea un módulo de ARIS,
    un adaptador de ARIS puede implementar este mismo puerto."""

    def get_account(self, username: str, active_only: bool = True) -> SellerAccount | None: ...
    def list_active(self) -> list[Seller]: ...
    def list_accounts(self) -> list[SellerAccount]: ...
    def create(self, account: SellerAccount) -> None: ...

    def save_security(self, account: SellerAccount, expected_version: int) -> bool:
        """Lo que la propia persona cambia al entrar o al cambiar su contraseña: hash, cambio
        obligatorio, intentos, bloqueo y versión de sesión. Nunca el rol ni el estado.

        Solo escribe si la versión de sesión sigue siendo `expected_version` (si no, otra
        petición la cambió: un restablecimiento, una desactivación...) y devuelve si escribió.
        """
        ...

    def save_profile(self, seller: Seller) -> None:
        """Guarda los datos visibles de la cuenta (nombre y zona)."""
        ...

    def get_preferences(self, username: str) -> Preferences | None:
        """Preferencias de la interfaz de la cuenta; None si aún no guardó ninguna."""
        ...

    def save_preferences(self, username: str, preferences: Preferences) -> None: ...

    def apply(self, change: AccountChange) -> ChangeOutcome:
        """Cambio administrativo atómico: vuelve a comprobar las condiciones de `change` con las
        filas bloqueadas y escribe solo lo que cambia. Ver domain/accounts.AccountChange."""
        ...


class DemandModelStore(Protocol):
    """La última corrida del modelo de demanda: métricas y predicciones fuera de muestra."""

    def latest(self) -> dict | None: ...
    def request_training(self, by: str) -> None:
        """Pide al programador que reentrene en cuanto pueda (llegaron datos nuevos)."""
        ...

    def training_pending(self) -> bool: ...
    def predictions(
        self, model: str, date_from: date, date_to: date, seller: str | None
    ) -> list[DailyUnits]: ...


class ProjectionHistory(Protocol):
    """Proyecciones históricas de fuera de la app (p. ej. lo pedido en ARIS), solo lectura."""

    def projections(
        self, date_from: date, date_to: date, seller: str | None
    ) -> list[Projection]: ...


class ProjectionRepository(Protocol):
    def find(
        self, date_from: date, date_to: date, seller: str | None = None
    ) -> list[Projection]: ...

    def replace(self, projections: list[Projection]) -> None:
        """Guarda las proyecciones en una sola transacción; reemplaza la de la misma
        terna (vendedor, fecha, categoría) si ya existía."""
        ...


class StockRepository(Protocol):
    """Stock de despacho por día."""

    def find(self, date_from: date, date_to: date) -> list[DailyStock]:
        """Días con registro en el rango, del más reciente al más antiguo."""
        ...

    def save(self, stock: DailyStock, location: str) -> None:
        """Guarda en una sola transacción las líneas de esa ubicación y reemplaza las que
        hubiera de ese día y esa ubicación (las de otras ubicaciones no se tocan)."""
        ...


class ProductionRepository(Protocol):
    """Producción diaria: lo pedido a granja y lo que llegó, por producto."""

    def find(self, date_from: date, date_to: date) -> list[DailyProduction]:
        """Días con registro en el rango, del más reciente al más antiguo."""
        ...

    def save(self, production: DailyProduction) -> None:
        """Guarda el día en una sola transacción y reemplaza lo que hubiera de ese día."""
        ...


class ConfirmedOrdersSource(Protocol):
    """Pedidos confirmados de clientes por producto para un día (unidades).

    Hoy no hay fuente: ARIS aún no se integra. Cuando entren (por Excel o por ARIS), un
    adaptador implementa este puerto y el cálculo de saca no cambia.
    """

    # False: no hay fuente conectada (el cálculo usa solo las proyecciones).
    available: bool

    def units(self, day: date) -> dict[str, int]: ...


class StoreOrderSource(Protocol):
    """Líneas de los pedidos de las tiendas con entrega en el rango, con la zona del reporte."""

    def lines(self, date_from: date, date_to: date) -> list[tuple[str | None, OrderLine]]: ...


class SalesSource(Protocol):
    """Venta real por vendedor, día y producto (hoy simulada; luego, ERP o lakehouse)."""

    def daily_units(
        self, date_from: date, date_to: date, seller: str | None
    ) -> list[DailyUnits]: ...


class DemandForecaster(Protocol):
    """Sugerencia de unidades por día (hoy promedio por día de semana; luego, modelo de ML)."""

    name: str

    def suggest(self, seller: str, category: str, dates: list[date]) -> list[DailyUnits]: ...


class ArrivalModel(Protocol):
    """Modelo de llegada por rango: se elige y se ajusta con la historia de producción."""

    def fit(
        self,
        history: list[DailyProduction],
        group_of: dict[str, str],
        weights: dict[str, float] | None = None,
        target: date | None = None,
    ) -> FittedArrival | None:
        """None si falta historia. `weights`: peso de la parvada del día a estimar, por tipo."""
        ...


class OrderHistory(Protocol):
    """Pedidos reales de un vendedor (historia cargada de ARIS)."""

    def lines(self, seller: str, before: date) -> list[OrderLine]: ...

    def team_lines(self, before: date) -> list[tuple[str, OrderLine]]:
        """Las de todo el equipo (con su vendedor), para la sugerencia general."""
        ...


class PasswordHasher(Protocol):
    # Hash con el formato válido que no corresponde a ninguna contraseña: verificarlo cuesta
    # lo mismo que uno real (sirve para no revelar qué usuarios existen).
    dummy_hash: str

    def hash(self, password: str) -> str: ...
    def verify(self, password: str, stored: str) -> bool: ...


@dataclass(frozen=True)
class TokenClaims:
    username: str
    version: int


class TokenService(Protocol):
    def issue(self, username: str, version: int) -> str: ...
    def decode(self, token: str) -> TokenClaims | None: ...


@dataclass(frozen=True)
class AssistantRequest:
    """Lo que el backend le manda al agente (n8n) por cada mensaje del chat de la app."""

    message: str
    # Conversación de esta persona (la memoria del agente se guarda por esta clave).
    conversation: str
    # Pase de corta duración: el agente consulta los datos como esta persona (ADR 0022).
    ticket: str
    username: str
    name: str
    role: str
    permissions: tuple[str, ...]
    # Lo que puede consultar, en palabras (el agente no ofrece nada fuera de esto).
    scope: str = ""
    # Últimos mensajes de la conversación, del más viejo al más nuevo: `(rol, texto)`. La memoria
    # del agente sale del historial guardado (ADR 0024), así sobrevive a un reinicio de n8n.
    history: tuple[tuple[str, str], ...] = ()
    # Desde dónde escribe la persona: `app`, `telegram` o `whatsapp` (cambia lo que se le ofrece).
    channel: str = "app"


class AssistantGateway(Protocol):
    """El agente de IA (workflow de n8n). Devuelve el texto de la respuesta."""

    def ask(self, request: AssistantRequest) -> str: ...


class TemporaryPasswords(Protocol):
    """Contraseñas temporales que entrega el supervisor (se cambian al primer ingreso)."""

    def generate(self) -> str: ...


class Clock(Protocol):
    def today(self) -> date: ...
    def now(self) -> datetime: ...


class StatusProbe(Protocol):
    def status(self) -> dict[str, Any]: ...


class NotificationRepository(Protocol):
    def add(self, notification: Notification) -> Notification | None:
        """Guarda y devuelve con id; None si ya existía una con el mismo `dedupe_key`."""
        ...

    def list_for(
        self,
        username: str,
        limit: int,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> list[Notification]:
        """Las más recientes primero; con `since`/`until`, solo las creadas en [since, until)."""
        ...

    def unread_count(self, username: str) -> int: ...

    def mark_read(self, username: str, ids: list[int] | None, now: datetime) -> int:
        """Marca como leídas las indicadas (o todas si `ids` es None). Devuelve cuántas."""
        ...

    def delete_for(self, username: str) -> None:
        """Borra todos los avisos de la persona (p. ej., al cambiar de rol)."""
        ...


class EventPublisher(Protocol):
    """Canal en tiempo real hacia los navegadores conectados (hoy en memoria; luego Redis,
    Postgres LISTEN/NOTIFY o RabbitMQ, con otro adaptador)."""

    def publish(self, event: Event) -> None: ...


class SacaSnapshotRepository(Protocol):
    """Saca guardada de cada día (una por día; guardar de nuevo la reemplaza)."""

    def save(self, snapshot: SacaSnapshot) -> None: ...
    def get(self, day: date) -> SacaSnapshot | None: ...
    def find(self, date_from: date, date_to: date) -> list[SacaSnapshot]: ...


class SettingsRepository(Protocol):
    """Ajustes que cambia el supervisor desde la app (p. ej., la hora de corte)."""

    def get(self, key: str) -> str | None: ...
    def set(self, key: str, value: str, updated_by: str, updated_at: datetime) -> None: ...


class UnlockRepository(Protocol):
    """Solicitudes de habilitación de edición."""

    def add(self, unlock: EditUnlock) -> EditUnlock:
        """Guarda y devuelve con id."""
        ...

    def get(self, unlock_id: int) -> EditUnlock | None: ...

    def latest(self, seller: str, day: date) -> EditUnlock | None:
        """La última solicitud del vendedor para ese día (la que manda)."""
        ...

    def list_since(self, since: date, seller: str | None) -> list[EditUnlock]:
        """Solicitudes para días desde `since` (de un vendedor o de todos), recientes primero."""
        ...

    def save(self, unlock: EditUnlock) -> None:
        """Guarda la decisión (estado, quién y cuándo)."""
        ...


class ChangeLog(Protocol):
    """Historial de cambios de las proyecciones."""

    def add(self, changes: list[ProjectionChange]) -> None: ...

    def list(self, date_from: date, date_to: date, seller: str | None) -> list[ProjectionChange]:
        """Cambios hechos entre esas fechas (de un vendedor o de todos), recientes primero."""
        ...


@dataclass(frozen=True)
class ArisLoad:
    """Resultado de cargar una hoja o archivo de ARIS."""

    kind: str  # despacho | ventas
    rows: int
    skipped: int
    date_from: date | None
    date_to: date | None
    # Las primeras filas descartadas, con su número y el motivo (para corregir el archivo).
    issues: tuple[str, ...] = ()


class ArisData(Protocol):
    """La venta real de ARIS guardada en la app (historia del modelo de demanda)."""

    def coverage(self) -> tuple[date | None, date | None]:
        """Último día con despacho y último día con ventas en tienda."""
        ...

    def load(self, content: bytes, filename: str) -> list[ArisLoad]:
        """Carga el export reemplazando solo las fechas que trae."""
        ...


class ConversationRepository(Protocol):
    """Conversaciones guardadas del asistente (ADR 0024)."""

    def get(self, conversation_id: UUID) -> Conversation | None: ...
    def create(self, conversation: Conversation) -> None: ...

    def add_message(self, message: StoredMessage, title: str | None = None) -> None:
        """Guarda el mensaje, sube `updated_at` de la conversación y, si viene, pone su título."""
        ...

    def messages(self, conversation_id: UUID) -> list[StoredMessage]:
        """Del más viejo al más nuevo."""
        ...

    def message(self, message_id: UUID) -> tuple[Conversation, StoredMessage] | None: ...

    def list_for(
        self, username: str, limit: int, before: datetime | None
    ) -> list[ConversationSummary]:
        """Las no archivadas y con mensajes, de la más reciente a la más vieja."""
        ...

    def latest_for(self, username: str, channel: str) -> Conversation | None:
        """La conversación no archivada más reciente de esa persona en ese canal."""
        ...

    def archive(self, conversation_id: UUID) -> None: ...

    def purge_before(self, cutoff: datetime) -> int:
        """Borra las conversaciones (y sus mensajes) sin actividad desde `cutoff`."""
        ...


class ChannelLinkRepository(Protocol):
    """Vinculación de un chat de Telegram o WhatsApp con una cuenta, y sus códigos."""

    def link(self, channel: str, sender: str, username: str, now: datetime) -> None:
        """Vincula (si ese chat ya estaba vinculado, lo reemplaza)."""
        ...

    def username_for(self, channel: str, sender: str) -> str | None: ...
    def delete_for(self, username: str) -> int: ...

    def save_code(self, code: str, username: str, now: datetime, expires_at: datetime) -> None:
        """Guarda el código (los anteriores de esa persona dejan de valer)."""
        ...

    def consume_code(self, code: str, now: datetime) -> str | None:
        """La persona dueña del código si sigue vigente; el código queda usado."""
        ...

    def purge_codes(self, now: datetime) -> int: ...


class DraftRepository(Protocol):
    """Borradores de fotos por confirmar (uno pendiente por persona)."""

    def replace(self, draft: Draft) -> None:
        """Guarda el borrador y descarta el pendiente anterior de esa persona."""
        ...

    def pending(self, username: str) -> Draft | None: ...
    def set_status(self, draft_id: UUID, status: str) -> None: ...
    def purge_before(self, cutoff: datetime) -> int: ...


class FileTokens(Protocol):
    """Token firmado de un solo archivo (una tabla de un mensaje) para los canales."""

    def issue(self, username: str, message_id: str, index: int) -> str: ...
    def decode(self, token: str) -> tuple[str, str, int] | None: ...


class TableExporter(Protocol):
    def xlsx(self, title: str | None, columns: list[str], rows: list[list[str]]) -> bytes: ...
