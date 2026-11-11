"""Historia de pedidos de un vendedor, leída de lo cargado con `cli historia`."""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.planning.domain.orders import ORDER_LOOKBACK, ORDER_MATERIAL_PREFIX, OrderLine
from app.planning.infrastructure.persistence.tables import dispatch_orders


class SqlOrderHistory:
    def __init__(self, session: Session) -> None:
        self.session = session

    def lines(self, seller: str, before: date) -> list[OrderLine]:
        """Líneas de pollo entero para brasa del vendedor, con entrega anterior a `before`.

        El vendedor se busca por su usuario sin distinguir mayúsculas («Rnavarro» = rnavarro).
        """
        t = dispatch_orders.c
        query = select(
            t.delivery_date,
            t.material,
            t.ordered_kg,
            t.ordered_units,
            t.dispatched_kg,
            t.dispatched_units,
        ).where(
            func.lower(t.seller) == seller.lower(),
            t.material.startswith(ORDER_MATERIAL_PREFIX, autoescape=True),
            t.delivery_date < before,
            t.delivery_date >= before - ORDER_LOOKBACK,
        )
        return [OrderLine(*row) for row in self.session.execute(query)]
