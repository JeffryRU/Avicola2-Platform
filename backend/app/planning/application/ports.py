"""Puertos de salida: lo que los casos de uso necesitan del exterior.

Los adaptadores de infrastructure/ los implementan; la aplicación nunca los importa.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Protocol

from app.planning.domain.accounts import AccountChange, ChangeOutcome
from app.planning.domain.editing import EditUnlock
from app.planning.domain.history import ProjectionChange
from app.planning.domain.models import DailyUnits, Product, Projection, Seller, SellerAccount
from app.planning.domain.notifications import Event, Notification
from app.planning.domain.stock import DailyStock


class ProductRepository(Protocol):
    def list_active(self) -> list[Product]: ...


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

    def apply(self, change: AccountChange) -> ChangeOutcome:
        """Cambio administrativo atómico: vuelve a comprobar las condiciones de `change` con las
        filas bloqueadas y escribe solo lo que cambia. Ver domain/accounts.AccountChange."""
        ...


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

    def save(self, stock: DailyStock) -> None:
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


class SalesSource(Protocol):
    """Venta real por vendedor, día y producto (hoy simulada; luego, ERP o lakehouse)."""

    def daily_units(
        self, date_from: date, date_to: date, seller: str | None
    ) -> list[DailyUnits]: ...


class DemandForecaster(Protocol):
    """Sugerencia de unidades por día (hoy promedio por día de semana; luego, modelo de ML)."""

    name: str

    def suggest(self, seller: str, category: str, dates: list[date]) -> list[DailyUnits]: ...


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

    def list_for(self, username: str, limit: int) -> list[Notification]: ...
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
