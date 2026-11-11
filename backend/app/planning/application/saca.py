"""Caso de uso del cálculo de saca: junta proyecciones, pedidos confirmados y stock."""

import json
import logging
from collections import Counter
from dataclasses import replace
from datetime import date, timedelta

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
    DEFAULT_METHOD,
    METHODS,
    SacaPlan,
    build_plan,
    product_group,
    stock_window,
)
from app.shared.domain.errors import DomainError

logger = logging.getLogger(__name__)

SACA_FACTORS_KEY = "saca_group_factors"
MIN_FACTOR, MAX_FACTOR = 0.0, 2.0


class SacaFactors:
    """Factor del pedido final por tipo: lo que guardó un supervisor o, si no, lo de `.env`."""

    def __init__(self, settings: SettingsRepository, defaults: dict[str, float]):
        self.settings, self.defaults = settings, defaults

    def get(self) -> dict[str, float]:
        stored = self.settings.get(SACA_FACTORS_KEY)
        if not stored:
            return dict(self.defaults)
        try:
            return {str(k): float(v) for k, v in json.loads(stored).items()}
        except (ValueError, AttributeError, TypeError):
            return dict(self.defaults)


class SetSacaFactors:
    """Un supervisor cambia por cuánto se multiplica lo que hace falta de cada tipo."""

    def __init__(
        self, products: ProductRepository, settings: SettingsRepository, clock: Clock
    ) -> None:
        self.products, self.settings, self.clock = products, settings, clock

    def __call__(self, actor: Seller, factors: dict[str, float]) -> dict[str, float]:
        require(actor.role, Permission.MANAGE_EDITING, "Solo un supervisor puede hacer esto.")
        groups = list(
            dict.fromkeys(product_group(p) for p in Catalog(self.products.list_active()).products)
        )
        unknown = [name for name in factors if name not in groups]
        if unknown:
            raise DomainError(f"No existe el tipo {unknown[0]}.")
        for name, factor in factors.items():
            if not MIN_FACTOR <= factor <= MAX_FACTOR:
                raise DomainError(
                    f"El factor de {name} debe estar entre {MIN_FACTOR:g} y {MAX_FACTOR:g}."
                )
        # Se guardan todos los tipos: el que no se indicó queda en 1 (se pide completo).
        saved = {name: round(factors.get(name, 1.0), 4) for name in groups}
        self.settings.set(
            SACA_FACTORS_KEY,
            json.dumps(saved, ensure_ascii=False),
            actor.username,
            self.clock.now(),
        )
        logger.info("Factores de la saca cambiados por %s: %s", actor.username, saved)
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
        factors: "SacaFactors | None" = None,
    ):
        self.products, self.projections, self.stock = products, projections, stock
        self.orders, self.sellers, self.yield_factor = orders, sellers, yield_factor
        # Historia de producción para estimar en qué rango llegará lo pedido.
        self.production, self.model = production, model
        self.factors = factors

    def __call__(self, viewer: Seller, day: date, method: str = DEFAULT_METHOD) -> SacaPlan:
        require(viewer.role, Permission.VIEW_SACA, "No tienes permiso para ver el cálculo de saca.")
        if method not in METHODS:
            raise DomainError("Forma de cálculo desconocida.")
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
            method=method,
            group_factors=tuple(self.factors.get().items()) if self.factors else (),
            stock_date=latest.date if latest else None,
            sellers_registered=len(registered),
            sellers_total=len(team),
            orders_available=self.orders.available,
            yield_factor=self.yield_factor,
        )
        if self.production is None or self.model is None:
            return plan
        # Solo con días anteriores al de la saca: lo de ese día aún no se conoce.
        history = self.production.find(day - LOOKBACK, day - timedelta(days=1))
        groups = {p.id: product_group(p) for p in products}
        fitted = self.model.fit(history, groups, target=day)
        if fitted is None:
            return plan
        arrival = estimate_from(fitted.rates, groups, plan.request_by_group())
        return replace(plan, arrival=replace(arrival, model=fitted.model))
