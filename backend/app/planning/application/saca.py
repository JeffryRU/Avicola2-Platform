"""Caso de uso del cálculo de saca: junta proyecciones, pedidos confirmados y stock."""

from collections import Counter
from dataclasses import replace
from datetime import date, timedelta

from app.planning.application.ports import (
    ConfirmedOrdersSource,
    ProductionRepository,
    ProductRepository,
    ProjectionRepository,
    SellerRepository,
    StockRepository,
)
from app.planning.domain.catalog import Catalog
from app.planning.domain.models import CONFIRMED, Seller
from app.planning.domain.permissions import Permission, require
from app.planning.domain.production import LOOKBACK, estimate_arrival
from app.planning.domain.saca import SacaPlan, build_plan, product_group, stock_window


class CalculateSaca:
    def __init__(
        self,
        products: ProductRepository,
        projections: ProjectionRepository,
        stock: StockRepository,
        orders: ConfirmedOrdersSource,
        sellers: SellerRepository,
        yield_factor: float,
        production: ProductionRepository | None = None,
    ):
        self.products, self.projections, self.stock = products, projections, stock
        self.orders, self.sellers, self.yield_factor = orders, sellers, yield_factor
        # Historia de producción para estimar en qué rango llegará lo pedido.
        self.production = production

    def __call__(self, viewer: Seller, day: date) -> SacaPlan:
        require(viewer.role, Permission.VIEW_SACA, "No tienes permiso para ver el cálculo de saca.")
        products = Catalog(self.products.list_active()).products
        team = {s.username for s in self.sellers.list_active() if s.is_seller}
        projected: Counter[str] = Counter()
        registered = set()
        for p in self.projections.find(day, day):
            if p.status == CONFIRMED and p.seller in team:
                projected.update(p.units)
                registered.add(p.seller)
        # El stock más reciente anterior al día (find devuelve del más reciente al más antiguo).
        recent = self.stock.find(*stock_window(day))
        latest = recent[0] if recent else None
        plan = build_plan(
            day,
            products,
            dict(projected),
            self.orders.units(day),
            {line.product_id: line.units for line in latest.lines} if latest else {},
            stock_date=latest.date if latest else None,
            sellers_registered=len(registered),
            sellers_total=len(team),
            orders_available=self.orders.available,
            yield_factor=self.yield_factor,
        )
        if self.production is None:
            return plan
        # Solo con días anteriores al de la saca: lo de ese día aún no se conoce.
        history = self.production.find(day - LOOKBACK, day - timedelta(days=1))
        groups = {p.id: product_group(p) for p in products}
        return replace(plan, arrival=estimate_arrival(history, groups, plan.request_by_group()))
