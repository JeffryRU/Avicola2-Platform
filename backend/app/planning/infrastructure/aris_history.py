"""Historia de ARIS (pedidos de despacho cargados con `cli historia`) vista como la app la usa.

Por vendedor, día y producto de brasa:
- **Proyección** = lo pedido (`PedidoDetalleCantidad`, columna K del export).
- **Venta real** = lo despachado (`CantidadDespachada`, columna L).

El vendedor de ARIS («Rnavarro») se empareja con la cuenta por usuario en minúsculas. El material
se lleva al producto con `product_for` (rango de peso del material). Solo lectura: nada de esto se
guarda como proyección de la app.
"""

from collections import defaultdict
from datetime import UTC, date, datetime, time
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.planning.application.ports import ProductRepository, SellerRepository
from app.planning.domain.models import CONFIRMED, DailyUnits, Projection, ProjectionLine
from app.planning.domain.orders import ORDER_CATEGORY, ORDER_MATERIAL_PREFIX, OrderLine, product_for
from app.planning.infrastructure.persistence.tables import dispatch_orders


class ArisHistory:
    """Solo cuenta a los vendedores con cuenta en la app (el equipo de los dashboards): los
    demás de ARIS no tienen proyección, modelo ni filtros con los que compararlos."""

    def __init__(
        self, session: Session, products: ProductRepository, sellers: SellerRepository
    ) -> None:
        self.session, self.products, self.sellers = session, products, sellers

    def available(self) -> bool:
        """¿Hay historia de ARIS cargada? (con vendedor: los pedidos de tiendas no cuentan)."""
        t = dispatch_orders.c
        return bool(self.session.scalar(select(exists().where(t.seller.is_not(None)))))

    def _days(
        self, date_from: date, date_to: date, seller: str | None, dispatched: bool
    ) -> dict[tuple[str, date], dict[str, float]]:
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
            t.delivery_date.between(date_from, date_to),
            t.seller.is_not(None),
            func.upper(t.material).startswith(ORDER_MATERIAL_PREFIX, autoescape=True),
        )
        team = [s.username.lower() for s in self.sellers.list_active() if s.is_seller]
        if seller:
            team = [seller.lower()] if seller.lower() in team else []
        if not team:
            return {}
        query = query.where(func.lower(t.seller).in_(team))
        products = [p for p in self.products.list_active() if p.category == ORDER_CATEGORY]
        out: dict[tuple[str, date], dict[str, float]] = defaultdict(dict)
        for who, day, *rest in self.session.execute(query):
            line = OrderLine(day, *rest)
            product = product_for(line, products)
            if product is None:
                continue
            if dispatched:
                units = line.dispatched_units or line.dispatched_kg / product.kg_per_unit
            else:
                units = line.ordered_units or line.ordered_kg / product.kg_per_unit
            day_units = out[(who, day)]
            day_units[product.id] = day_units.get(product.id, 0.0) + units
        return out

    def sales(self, date_from: date, date_to: date, seller: str | None) -> list[DailyUnits]:
        """Venta real: lo despachado por vendedor, día y producto."""
        return [
            DailyUnits(who, day, {pid: round(n) for pid, n in units.items() if round(n) > 0})
            for (who, day), units in self._days(date_from, date_to, seller, dispatched=True).items()
        ]

    def projections(self, date_from: date, date_to: date, seller: str | None) -> list[Projection]:
        """Proyección histórica: lo pedido por vendedor y día, como una proyección confirmada."""
        weights = {p.id: p.kg_per_unit for p in self.products.list_active()}
        found = []
        for (who, day), units in self._days(date_from, date_to, seller, dispatched=False).items():
            lines = tuple(
                ProjectionLine(pid, round(n), round(round(n) * weights.get(pid, 0), 2))
                for pid, n in sorted(units.items())
                if round(n) > 0
            )
            if not lines:
                continue
            key = uuid5(NAMESPACE_URL, f"aris:{who}:{day}")
            found.append(
                Projection(
                    key,
                    key,
                    who,
                    day,
                    ORDER_CATEGORY,
                    lines,
                    datetime.combine(day, time(), tzinfo=UTC),
                    CONFIRMED,
                    1,
                )
            )
        return found


class ArisOrSimulatedSales:
    """Venta real de ARIS si hay historia cargada; si no (demo local), la simulada."""

    def __init__(self, aris: ArisHistory, simulated) -> None:
        self.aris, self.simulated = aris, simulated

    def daily_units(self, date_from: date, date_to: date, seller: str | None) -> list[DailyUnits]:
        if self.aris.available():
            return self.aris.sales(date_from, date_to, seller)
        return self.simulated.daily_units(date_from, date_to, seller)
