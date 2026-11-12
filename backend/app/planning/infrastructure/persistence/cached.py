"""Repositorios con caché: envuelven a los de SQL sin cambiar su interfaz (los conecta bootstrap).

Funcionan igual con la caché en memoria o en Redis (ver shared/infrastructure/cache.py).

Se cachea solo lo que se lee en casi cada petición y cambia poco. Toda escritura que pasa por
estos repositorios invalida su parte de la caché. NO se cachea la cuenta de la sesión
(`get_account`): de ella dependen la desactivación y el cierre de sesiones, que deben valer al
instante.

Las listas se devuelven como copia: los elementos son dataclasses inmutables, pero la lista no.
"""

from dataclasses import asdict
from datetime import datetime
from typing import Any

from app.planning.domain.models import Product, Seller
from app.planning.infrastructure.persistence.editing import SqlSettingsRepository
from app.planning.infrastructure.persistence.repositories import (
    SqlProductRepository,
    SqlSellerRepository,
)
from app.shared.infrastructure.cache import Cache, Codec

SETTINGS = "settings:"
PRODUCTS = "products:"
SELLERS = "sellers:"

PRODUCTS_CODEC: Codec[list[Product]] = Codec(
    lambda items: [asdict(p) for p in items], lambda rows: [Product(**r) for r in rows]
)
SELLERS_CODEC: Codec[list[Seller]] = Codec(
    lambda items: [asdict(s) for s in items], lambda rows: [Seller(**r) for r in rows]
)


class CachedSettingsRepository:
    def __init__(self, inner: SqlSettingsRepository, cache: Cache) -> None:
        self.inner = inner
        self.cache = cache

    def get(self, key: str) -> str | None:
        return self.cache.get_or_load(SETTINGS + key, lambda: self.inner.get(key))

    def set(self, key: str, value: str, updated_by: str, updated_at: datetime) -> None:
        try:
            self.inner.set(key, value, updated_by, updated_at)
        finally:
            self.cache.invalidate(SETTINGS + key)


class CachedProductRepository:
    """Los productos solo los escribe la CLI, que al terminar invalida la caché."""

    def __init__(self, inner: SqlProductRepository, cache: Cache) -> None:
        self.inner = inner
        self.cache = cache

    def list_stock_items(self) -> list[Product]:
        found = self.cache.get_or_load(
            PRODUCTS + "stock", self.inner.list_stock_items, PRODUCTS_CODEC
        )
        return list(found)

    def list_active(self) -> list[Product]:
        return [p for p in self.list_stock_items() if p.quality == "A"]

    def __getattr__(self, name: str) -> Any:
        return getattr(self.inner, name)


class CachedSellerRepository:
    """Cachea la lista de vendedores activos; cualquier escritura de cuentas la invalida."""

    _WRITES = frozenset({"create", "save_security", "apply", "save_profile"})

    def __init__(self, inner: SqlSellerRepository, cache: Cache) -> None:
        self.inner = inner
        self.cache = cache

    def list_active(self) -> list[Seller]:
        found = self.cache.get_or_load(SELLERS + "active", self.inner.list_active, SELLERS_CODEC)
        return list(found)

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self.inner, name)
        if name not in self._WRITES:
            return attr

        def write(*args: Any, **kwargs: Any) -> Any:
            try:
                return attr(*args, **kwargs)
            finally:
                self.cache.invalidate(SELLERS)

        return write
