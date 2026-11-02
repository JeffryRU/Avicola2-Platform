"""Puertos de salida: lo que los casos de uso necesitan del exterior.

Los adaptadores de infrastructure/ los implementan; la aplicación nunca los importa.
"""

from datetime import date, datetime
from typing import Any, Protocol

from app.planning.domain.models import DailyUnits, Product, Projection, Seller, SellerAccount


class ProductRepository(Protocol):
    def list_active(self) -> list[Product]: ...


class SellerRepository(Protocol):
    def get_account(self, username: str) -> SellerAccount | None: ...
    def list_active(self) -> list[Seller]: ...


class ProjectionRepository(Protocol):
    def find(
        self, date_from: date, date_to: date, seller: str | None = None
    ) -> list[Projection]: ...

    def replace(self, projections: list[Projection]) -> None:
        """Guarda las proyecciones en una sola transacción; reemplaza la de la misma
        terna (vendedor, fecha, categoría) si ya existía."""
        ...


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
    def hash(self, password: str) -> str: ...
    def verify(self, password: str, stored: str) -> bool: ...


class TokenService(Protocol):
    def issue(self, username: str) -> str: ...
    def subject(self, token: str) -> str | None: ...


class Clock(Protocol):
    def today(self) -> date: ...
    def now(self) -> datetime: ...


class StatusProbe(Protocol):
    def status(self) -> dict[str, Any]: ...
