"""Caso de uso del cálculo de saca: junta proyecciones, pedidos confirmados y stock."""

import json
import logging
from collections import Counter
from dataclasses import replace
from datetime import date

from app.planning.application.ports import (
    ArrivalModel,
    Clock,
    ConfirmedOrdersSource,
    ProductionRepository,
    ProductRepository,
    ProjectionRepository,
    SellerRepository,
    SettingsRepository,
    StockRepository,
)
from app.planning.domain.catalog import Catalog
from app.planning.domain.models import CONFIRMED, Seller
from app.planning.domain.permissions import Permission, require
from app.planning.domain.production import LOOKBACK, estimate_from
from app.planning.domain.saca import (
    SacaPlan,
    build_plan,
    orders_day,
    product_group,
    projection_day,
    stock_window,
)
from app.shared.domain.errors import DomainError

logger = logging.getLogger(__name__)

SACA_PLUS_KEY = "saca_group_plus"
MAX_PLUS = 100_000


class SacaPlus:
    """Plus por tipo (aves extra que se suman al pedido a granja): lo que guardó un supervisor
    o, si no, lo de `.env` (SACA_GROUP_PLUS)."""

    def __init__(self, settings: SettingsRepository, defaults: dict[str, int]):
        self.settings, self.defaults = settings, defaults

    def get(self) -> dict[str, int]:
        stored = self.settings.get(SACA_PLUS_KEY)
        if not stored:
            return dict(self.defaults)
        try:
            return {str(k): int(v) for k, v in json.loads(stored).items()}
        except (ValueError, AttributeError, TypeError):
            return dict(self.defaults)


class SetSacaPlus:
    """Un supervisor cambia el plus (aves extra) de cada tipo."""

    def __init__(
        self, products: ProductRepository, settings: SettingsRepository, clock: Clock
    ) -> None:
        self.products, self.settings, self.clock = products, settings, clock

    def __call__(self, actor: Seller, plus: dict[str, int]) -> dict[str, int]:
        require(actor.role, Permission.MANAGE_EDITING, "Solo un supervisor puede hacer esto.")
        groups = list(
            dict.fromkeys(product_group(p) for p in Catalog(self.products.list_active()).products)
        )
        unknown = [name for name in plus if name not in groups]
        if unknown:
            raise DomainError(f"No existe el tipo {unknown[0]}.")
        for name, units in plus.items():
            if not 0 <= units <= MAX_PLUS:
                raise DomainError(f"El plus de {name} debe estar entre 0 y {MAX_PLUS:,}.")
        # Se guardan todos los tipos: el que no se indicó queda en 0 (sin plus).
        saved = {name: int(plus.get(name, 0)) for name in groups}
        self.settings.set(
            SACA_PLUS_KEY, json.dumps(saved, ensure_ascii=False), actor.username, self.clock.now()
        )
        logger.info("Plus de la saca cambiado por %s: %s", actor.username, saved)
        return saved


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
        model: ArrivalModel | None = None,
        plus: SacaPlus | None = None,
        stock_lot_days: int | None = None,
    ):
        self.products, self.projections, self.stock = products, projections, stock
        self.orders, self.sellers, self.yield_factor = orders, sellers, yield_factor
        # Historia de producción para estimar en qué rango llegará lo pedido.
        self.production, self.model = production, model
        self.plus = plus
        # Antigüedad máxima (días) de los lotes de stock que se descuentan; None = todos.
        self.stock_lot_days = stock_lot_days

    def __call__(self, viewer: Seller, day: date) -> SacaPlan:
        """Saca calculada el día `day`: stock hasta ese día − pedidos de mañana + proyección de
        pasado mañana + plus por tipo."""
        require(viewer.role, Permission.VIEW_SACA, "No tienes permiso para ver el cálculo de saca.")
        products = Catalog(self.products.list_active()).products
        team = {s.username for s in self.sellers.list_active() if s.is_seller}
        projected: Counter[str] = Counter()
        registered = set()
        target = projection_day(day)
        for p in self.projections.find(target, target):
            if p.status == CONFIRMED and p.seller in team:
                projected.update(p.units)
                registered.add(p.seller)
        # El stock más reciente hasta el día (find devuelve del más reciente al más antiguo).
        recent = self.stock.find(*stock_window(day))
        latest = recent[0] if recent else None
        # Solo cuentan los lotes recientes; la calidad B se suma por tipo.
        fresh = latest.units_by_product(self.stock_lot_days) if latest else {}
        quality_b: Counter[str] = Counter()
        for item in self.products.list_stock_items():
            if item.quality != "A" and fresh.get(item.id):
                quality_b[product_group(item)] += fresh[item.id]
        plan = build_plan(
            day,
            products,
            dict(projected),
            self.orders.units(orders_day(day)),
            fresh,
            group_plus=tuple(self.plus.get().items()) if self.plus else (),
            stock_date=latest.date if latest else None,
            stock_b_by_group=tuple(quality_b.items()),
            stock_old=(latest.total_units - sum(fresh.values())) if latest else 0,
            stock_lot_days=self.stock_lot_days,
            sellers_registered=len(registered),
            sellers_total=len(team),
            orders_available=self.orders.available,
            yield_factor=self.yield_factor,
        )
        if self.production is None or self.model is None:
            return plan
        # Lo pedido llega pasado mañana; se estima con la producción registrada hasta hoy.
        arrives = projection_day(day)
        history = self.production.find(arrives - LOOKBACK, day)
        groups = {p.id: product_group(p) for p in products}
        fitted = self.model.fit(history, groups, target=arrives)
        if fitted is None:
            return plan
        arrival = estimate_from(fitted.rates, groups, plan.request_by_group())
        return replace(plan, arrival=replace(arrival, model=fitted.model))
