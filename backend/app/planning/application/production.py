"""Casos de uso de la producción diaria: registrar la de un día y consultar lo registrado."""

import logging
from dataclasses import dataclass
from datetime import date, timedelta

from app.planning.application.ports import (
    ArrivalModel,
    Clock,
    ProductionRepository,
    ProductRepository,
)
from app.planning.application.use_cases import _check_range
from app.planning.domain.catalog import Catalog
from app.planning.domain.models import Product, Seller
from app.planning.domain.permissions import Permission, require
from app.planning.domain.production import (
    LOOKBACK,
    MAX_BIRDS,
    MAX_FLOCK_KG,
    MIN_FLOCK_KG,
    DailyProduction,
    FittedArrival,
    ProductionLine,
    check_production_date,
    latest_weights,
)
from app.planning.domain.saca import product_group
from app.shared.domain.errors import DomainError

logger = logging.getLogger(__name__)


def _weight_error(group: str) -> str:
    return f"El peso promedio de {group} debe estar entre {MIN_FLOCK_KG} y {MAX_FLOCK_KG} kg."


@dataclass(frozen=True)
class ProductionEntry:
    product_id: str
    ordered: float
    produced: int
    quality_b: int = 0


class RegisterProduction:
    """Guarda la producción de un día y reemplaza lo que hubiera de ese día (una corrección)."""

    def __init__(self, products: ProductRepository, production: ProductionRepository, clock: Clock):
        self.products, self.production, self.clock = products, production, clock

    def __call__(
        self,
        actor: Seller,
        day: date,
        entries: list[ProductionEntry],
        weights: dict[str, float] | None = None,
    ) -> DailyProduction:
        require(
            actor.role,
            Permission.MANAGE_PRODUCTION,
            "No tienes permiso para registrar la producción.",
        )
        check_production_date(day, self.clock.today())
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
            if not (0 <= entry.ordered <= MAX_BIRDS and 0 <= entry.produced <= MAX_BIRDS):
                raise DomainError(f"Cantidad fuera de rango en {product.name}.")
            if not 0 <= entry.quality_b <= entry.produced:
                raise DomainError(f"En {product.name}, la calidad B no puede superar lo producido.")
            lines.append(
                ProductionLine(product.id, round(entry.ordered, 2), entry.produced, entry.quality_b)
            )
        groups = {product_group(p) for p in catalog.values()}
        flock: dict[str, float] = {}
        for group, kg in (weights or {}).items():
            if group not in groups:
                raise DomainError(f"No existe el tipo {group}.")
            if not MIN_FLOCK_KG <= kg <= MAX_FLOCK_KG:
                raise DomainError(_weight_error(group))
            flock[group] = round(kg, 3)
        saved = DailyProduction(day, tuple(lines), actor.username, self.clock.now(), flock)
        self.production.save(saved)
        logger.info(
            "Producción del %s registrada por %s: %d aves (%.0f pedidas)",
            day,
            actor.username,
            saved.produced,
            saved.ordered,
        )
        return saved


class ListProduction:
    """Producción registrada por día en un rango (solo los días con registro)."""

    def __init__(self, production: ProductionRepository):
        self.production = production

    def __call__(self, viewer: Seller, date_from: date, date_to: date) -> list[DailyProduction]:
        require(
            viewer.role, Permission.VIEW_PRODUCTION, "No tienes permiso para ver la producción."
        )
        _check_range(date_from, date_to)
        return self.production.find(date_from, date_to)


@dataclass(frozen=True)
class ArrivalForecast:
    """El modelo de llegada listo para proyectar, y cómo le fue en los últimos días."""

    # Tipos de pedido (Brasa chica, mediana, grande) con sus productos, en el orden del catálogo.
    groups: list[tuple[str, list[Product]]]
    # None si todavía falta historia de producción.
    fitted: FittedArrival | None
    # Lo último que se pidió de cada tipo y su último peso anotado: punto de partida.
    last_request: dict[str, float]
    last_weights: dict[str, float]


class ForecastArrival:
    """Ajusta el modelo de llegada por rango con la producción registrada hasta hoy."""

    def __init__(
        self,
        products: ProductRepository,
        production: ProductionRepository,
        clock: Clock,
        model: ArrivalModel,
    ):
        self.products, self.production, self.clock = products, production, clock
        self.model = model

    def __call__(self, viewer: Seller, weights: list[float] | None = None) -> ArrivalForecast:
        """`weights`: peso de la parvada que se espera de cada tipo, en el orden de los tipos
        (0 o ausente: se usa el último anotado)."""
        require(
            viewer.role, Permission.VIEW_PRODUCTION, "No tienes permiso para ver la producción."
        )
        products = Catalog(self.products.list_active()).products
        group_of = {p.id: product_group(p) for p in products}
        groups: dict[str, list[Product]] = {}
        for product in products:
            groups.setdefault(group_of[product.id], []).append(product)
        today = self.clock.today()
        history = self.production.find(today - LOOKBACK, today)
        last_request: dict[str, float] = {}
        latest = max((d for d in history if d.ordered > 0), key=lambda d: d.date, default=None)
        for line in latest.lines if latest else ():
            group = group_of.get(line.product_id)
            if group:
                last_request[group] = round(last_request.get(group, 0.0) + line.ordered, 2)
        given = {g: kg for g, kg in zip(groups, weights or [], strict=False) if kg > 0}
        for group, kg in given.items():
            if not MIN_FLOCK_KG <= kg <= MAX_FLOCK_KG:
                raise DomainError(_weight_error(group))
        return ArrivalForecast(
            list(groups.items()),
            self.model.fit(history, group_of, given, today + timedelta(days=1)),
            last_request,
            latest_weights(history),
        )
