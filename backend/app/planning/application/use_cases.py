"""Casos de uso de la planificación de demanda (puertos de entrada).

Cada clase hace una sola cosa y recibe sus dependencias como puertos.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from uuid import UUID, uuid4

from app.planning.application.ports import (
    Clock,
    DemandForecaster,
    ProductRepository,
    ProjectionRepository,
    SalesSource,
    SellerRepository,
)
from app.planning.domain.catalog import Catalog
from app.planning.domain.models import SELLER, DailyUnits, Product, Projection, Seller
from app.shared.domain.errors import DomainError, ForbiddenError

logger = logging.getLogger(__name__)

MAX_RANGE_DAYS = 400


class GetCatalog:
    def __init__(self, products: ProductRepository):
        self.products = products

    def __call__(self) -> list[Product]:
        return Catalog(self.products.list_active()).products


def visible_seller(viewer: Seller, requested: str | None) -> str | None:
    """Un vendedor solo ve lo suyo; el supervisor, a todos o al que filtre."""
    return requested if viewer.is_supervisor else viewer.username


class ListSellers:
    def __init__(self, sellers: SellerRepository):
        self.sellers = sellers

    def __call__(self, viewer: Seller) -> list[Seller]:
        if not viewer.is_supervisor:
            return [viewer]
        return [s for s in self.sellers.list_active() if s.role == SELLER]


def _check_range(date_from: date, date_to: date) -> None:
    if date_to < date_from:
        raise DomainError("El rango de fechas está invertido.")
    if (date_to - date_from).days > MAX_RANGE_DAYS:
        raise DomainError(f"El rango no puede superar {MAX_RANGE_DAYS} días.")


class ListProjections:
    def __init__(self, projections: ProjectionRepository):
        self.projections = projections

    def __call__(
        self, viewer: Seller, date_from: date, date_to: date, seller: str | None
    ) -> list[Projection]:
        _check_range(date_from, date_to)
        return self.projections.find(date_from, date_to, visible_seller(viewer, seller))


@dataclass(frozen=True)
class DayUnits:
    date: date
    units: dict[str, int]


class SubmitProjection:
    """Guarda (o reemplaza) la proyección de cada día enviado."""

    def __init__(
        self,
        products: ProductRepository,
        projections: ProjectionRepository,
        clock: Clock,
        max_days: int,
        on_submitted: Callable[[Seller, list[Projection]], None] | None = None,
    ):
        self.products, self.projections, self.clock = products, projections, clock
        self.max_days = max_days
        # Se llama tras guardar (avisos al supervisor); la carga de ejemplos no lo usa.
        self.on_submitted = on_submitted

    def __call__(
        self, seller: Seller, category: str, days: list[DayUnits], submission_id: UUID | None
    ) -> list[Projection]:
        if seller.is_supervisor:
            raise ForbiddenError("Las proyecciones las registra cada vendedor.")
        if not 1 <= len(days) <= self.max_days:
            raise DomainError(f"Debe enviar entre 1 y {self.max_days} días.")
        if len({d.date for d in days}) != len(days):
            raise DomainError("Hay fechas repetidas.")
        catalog, today, now = (
            Catalog(self.products.list_active()),
            self.clock.today(),
            self.clock.now(),
        )
        submission = submission_id or uuid4()
        result = []
        for day in sorted(days, key=lambda d: d.date):
            if day.date < today:
                raise DomainError(f"El día {day.date:%d/%m/%Y} ya pasó.")
            lines = catalog.lines_for(category, day.units)
            projection = Projection(
                uuid4(), submission, seller.username, day.date, category, lines, now
            )
            if projection.total_units == 0:
                raise DomainError(f"El día {day.date:%d/%m/%Y} no tiene unidades.")
            result.append(projection)
        self.projections.replace(result)
        logger.info(
            "Proyección %s de %s guardada: %s, %d día(s), %d unidades",
            submission,
            seller.username,
            category,
            len(result),
            sum(p.total_units for p in result),
        )
        if self.on_submitted:
            self.on_submitted(seller, result)
        return result


class GetSales:
    def __init__(self, sales: SalesSource):
        self.sales = sales

    def __call__(
        self, viewer: Seller, date_from: date, date_to: date, seller: str | None
    ) -> list[DailyUnits]:
        _check_range(date_from, date_to)
        return self.sales.daily_units(date_from, date_to, visible_seller(viewer, seller))


class SuggestProjection:
    def __init__(self, products: ProductRepository, forecaster: DemandForecaster, max_days: int):
        self.products, self.forecaster, self.max_days = products, forecaster, max_days

    def __call__(self, seller: Seller, category: str, start: date, days: int) -> list[DailyUnits]:
        if not 1 <= days <= self.max_days:
            raise DomainError(f"Debe pedir entre 1 y {self.max_days} días.")
        Catalog(self.products.list_active()).of(category)  # valida la categoría
        dates = [start + timedelta(days=i) for i in range(days)]
        return self.forecaster.suggest(seller.username, category, dates)
