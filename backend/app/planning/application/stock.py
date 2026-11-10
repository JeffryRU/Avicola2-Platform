"""Casos de uso del stock de despacho: registrar el de un día y consultar lo registrado."""

import logging
from dataclasses import dataclass
from datetime import date

from app.planning.application.ports import Clock, ProductRepository, StockRepository
from app.planning.application.use_cases import _check_range
from app.planning.domain.models import Seller
from app.planning.domain.permissions import Permission, require
from app.planning.domain.stock import (
    MAX_KG,
    MAX_UNITS,
    DailyStock,
    StockLine,
    check_stock_date,
)
from app.shared.domain.errors import DomainError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StockEntry:
    """Lo que llega del formulario. Sin `kg`, se calcula con el peso promedio del producto."""

    product_id: str
    units: int
    kg: float | None = None


class RegisterStock:
    """Guarda el stock de un día y reemplaza lo que hubiera de ese día (una corrección)."""

    def __init__(self, products: ProductRepository, stock: StockRepository, clock: Clock):
        self.products, self.stock, self.clock = products, stock, clock

    def __call__(self, actor: Seller, day: date, entries: list[StockEntry]) -> DailyStock:
        require(actor.role, Permission.MANAGE_STOCK, "No tienes permiso para registrar el stock.")
        check_stock_date(day, self.clock.today())
        if not entries:
            raise DomainError("Registra al menos un producto.")
        if len({e.product_id for e in entries}) != len(entries):
            raise DomainError("Hay productos repetidos.")
        catalog = {p.id: p for p in self.products.list_active()}
        lines = []
        for entry in entries:
            product = catalog.get(entry.product_id)
            if product is None:
                raise DomainError(f"El producto {entry.product_id} no existe o no está activo.")
            kg = product.kg(entry.units) if entry.kg is None else round(entry.kg, 2)
            if not 0 <= entry.units <= MAX_UNITS or not 0 <= kg <= MAX_KG:
                raise DomainError(f"Cantidad fuera de rango en {product.name}.")
            lines.append(StockLine(product.id, entry.units, kg))
        saved = DailyStock(day, tuple(lines), actor.username, self.clock.now())
        self.stock.save(saved)
        logger.info(
            "Stock de despacho del %s registrado por %s: %d unid., %.2f kg",
            day,
            actor.username,
            saved.total_units,
            saved.total_kg,
        )
        return saved


class ListStock:
    """Stock registrado por día en un rango (solo los días que tienen registro)."""

    def __init__(self, stock: StockRepository):
        self.stock = stock

    def __call__(self, viewer: Seller, date_from: date, date_to: date) -> list[DailyStock]:
        require(viewer.role, Permission.VIEW_STOCK, "No tienes permiso para ver el stock.")
        _check_range(date_from, date_to)
        return self.stock.find(date_from, date_to)
