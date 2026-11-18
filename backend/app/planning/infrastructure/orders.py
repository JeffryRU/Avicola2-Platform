"""Pedidos confirmados para el cálculo de saca.

`LoadedOrders` los toma de la historia de ARIS cargada con `cli historia` (tabla de pedidos de
despacho): no es una conexión en vivo, así que solo hay pedidos para los días que estén en el
archivo cargado. `NoConfirmedOrders` es la fuente vacía (pruebas, o si no se quiere usar).
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.planning.application.ports import ProductRepository
from app.planning.domain.orders import (
    ORDER_CATEGORY,
    ORDER_MATERIAL_PREFIX,
    OrderLine,
    daily_units,
)
from app.planning.infrastructure.persistence.tables import dispatch_orders
from app.planning.infrastructure.store_orders_import import STORE_CODE_PREFIX


class NoConfirmedOrders:
    available = False

    def units(self, day: date) -> dict[str, int]:  # noqa: ARG002 (lo exige el puerto)
        return {}


class LoadedOrders:
    """Pedidos de pollo entero para brasa con entrega ese día, llevados a productos del catálogo."""

    def __init__(self, session: Session, products: ProductRepository) -> None:
        self.session, self.products = session, products
        # Se actualiza en cada consulta: ¿hay pedidos cargados para ese día?
        self.available = False

    def units(self, day: date) -> dict[str, int]:
        t = dispatch_orders.c
        query = select(
            t.delivery_date,
            t.material,
            t.ordered_kg,
            t.ordered_units,
            t.dispatched_kg,
            t.dispatched_units,
        ).where(
            t.delivery_date == day,
            t.material.startswith(ORDER_MATERIAL_PREFIX, autoescape=True),
        )
        lines = [OrderLine(*row) for row in self.session.execute(query)]
        products = [p for p in self.products.list_active() if p.category == ORDER_CATEGORY]
        units = daily_units(lines, products).get(day, {})
        self.available = bool(lines)
        return {product: round(n) for product, n in units.items() if round(n) > 0}


class LoadedStoreOrders:
    """Pedidos de las tiendas cargados con `cli tiendas` (filas TIENDA- de la tabla de despacho)."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def lines(self, date_from: date, date_to: date) -> list[tuple[str | None, OrderLine]]:
        t = dispatch_orders.c
        query = select(
            t.zone,
            t.delivery_date,
            t.material,
            t.ordered_kg,
            t.ordered_units,
            t.dispatched_kg,
            t.dispatched_units,
        ).where(
            t.delivery_date.between(date_from, date_to),
            t.material_code.startswith(STORE_CODE_PREFIX, autoescape=True),
        )
        return [(row[0], OrderLine(*row[1:])) for row in self.session.execute(query)]
