"""Historia de pedidos de un vendedor, leída de lo cargado con `cli historia`."""

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.planning.domain.orders import ORDER_LOOKBACK, ORDER_MATERIAL_PREFIX, OrderLine
from app.planning.infrastructure.persistence.tables import dispatch_orders

# Historia del equipo para la sugerencia general: 6 semanas (4 días iguales y margen).
TEAM_LOOKBACK = timedelta(weeks=6)


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

    def team_lines(self, before: date) -> list[tuple[str, OrderLine]]:
        """Las líneas de brasa de todos los vendedores en las últimas `TEAM_LOOKBACK` (alcanza
        para la mediana de 4 semanas); sin las de tiendas ni las que no tienen vendedor."""
        t = dispatch_orders.c
        query = select(
            func.lower(t.seller),
            t.delivery_date,
            t.material,
            t.ordered_kg,
            t.ordered_units,
            t.dispatched_kg,
            t.dispatched_units,
        ).where(
            t.seller.is_not(None),
            t.material.startswith(ORDER_MATERIAL_PREFIX, autoescape=True),
            t.delivery_date < before,
            t.delivery_date >= before - TEAM_LOOKBACK,
        )
        return [(row[0], OrderLine(*row[1:])) for row in self.session.execute(query)]
