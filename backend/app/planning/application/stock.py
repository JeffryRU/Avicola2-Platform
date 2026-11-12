"""Casos de uso del stock de despacho: registrar el de un día y consultar lo registrado."""

import logging
from dataclasses import dataclass
from datetime import date

from app.planning.application.ports import Clock, ProductRepository, StockRepository
from app.planning.application.use_cases import _check_range
from app.planning.domain.models import Product, Seller
from app.planning.domain.permissions import Permission, require
from app.planning.domain.stock import (
    MAX_UNITS,
    DailyStock,
    StockLine,
    check_lot_date,
    check_stock_date,
)
from app.shared.domain.errors import DomainError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StockEntry:
    """Lo que llega del formulario: unidades de un producto en un lote (los kg se calculan)."""

    product_id: str
    units: int
    # Fecha de beneficio del lote; sin ella se toma el día del stock.
    lot_date: date | None = None


@dataclass(frozen=True)
class StockOptions:
    """Con qué se arma el formulario: artículos (incluye calidad B) y ubicaciones."""

    items: list[Product]
    locations: list[str]
    lot_days: int


class RegisterStock:
    """Guarda el stock de un día en una ubicación y reemplaza lo que hubiera ahí ese día."""

    def __init__(
        self,
        products: ProductRepository,
        stock: StockRepository,
        clock: Clock,
        locations: list[str] | None = None,
    ):
        self.products, self.stock, self.clock = products, stock, clock
        self.locations = locations or ["General"]

    def __call__(
        self, actor: Seller, day: date, entries: list[StockEntry], location: str | None = None
    ) -> DailyStock:
        require(actor.role, Permission.MANAGE_STOCK, "No tienes permiso para registrar el stock.")
        check_stock_date(day, self.clock.today())
        place = location or self.locations[0]
        if place not in self.locations:
            raise DomainError(f"La ubicación {place} no existe.")
        if not entries:
            raise DomainError("Registra al menos un producto.")
        keys = {(e.product_id, e.lot_date or day) for e in entries}
        if len(keys) != len(entries):
            raise DomainError("Hay un producto repetido en el mismo lote.")
        catalog = {p.id: p for p in self.products.list_stock_items()}
        lines = []
        for entry in entries:
            product = catalog.get(entry.product_id)
            if product is None:
                raise DomainError(f"El producto {entry.product_id} no existe o no está activo.")
            if not 0 <= entry.units <= MAX_UNITS:
                raise DomainError(f"Cantidad fuera de rango en {product.name}.")
            lot = entry.lot_date or day
            check_lot_date(lot, day)
            lines.append(StockLine(product.id, entry.units, product.kg(entry.units), place, lot))
        saved = DailyStock(day, tuple(lines), actor.username, self.clock.now())
        self.stock.save(saved, place)
        logger.info(
            "Stock de despacho del %s en %s registrado por %s: %d unid., %.2f kg",
            day,
            place,
            actor.username,
            saved.total_units,
            saved.total_kg,
        )
        # Lo que quedó del día completo, con las demás ubicaciones.
        return next((d for d in self.stock.find(day, day)), saved)


class ListStock:
    """Stock registrado por día en un rango (solo los días que tienen registro)."""

    def __init__(self, stock: StockRepository):
        self.stock = stock

    def __call__(self, viewer: Seller, date_from: date, date_to: date) -> list[DailyStock]:
        require(viewer.role, Permission.VIEW_STOCK, "No tienes permiso para ver el stock.")
        _check_range(date_from, date_to)
        return self.stock.find(date_from, date_to)


class GetStockOptions:
    def __init__(self, products: ProductRepository, locations: list[str], lot_days: int):
        self.products, self.locations, self.lot_days = products, locations, lot_days

    def __call__(self, viewer: Seller) -> StockOptions:
        require(viewer.role, Permission.VIEW_STOCK, "No tienes permiso para ver el stock.")
        items = sorted(
            self.products.list_stock_items(), key=lambda p: (p.category, p.sort_order, p.id)
        )
        return StockOptions(items, list(self.locations), self.lot_days)
