"""Casos de uso de la planificación de demanda (puertos de entrada).

Cada clase hace una sola cosa y recibe sus dependencias como puertos.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from app.planning.application.ports import (
    ChangeLog,
    Clock,
    DemandForecaster,
    ProductRepository,
    ProjectionRepository,
    SalesSource,
    SellerRepository,
)
from app.planning.domain.catalog import Catalog
from app.planning.domain.history import CREATED, UPDATED, ProjectionChange
from app.planning.domain.models import SELLER, DailyUnits, Product, Projection, Seller
from app.shared.domain.errors import DomainError, ForbiddenError, NotFoundError

if TYPE_CHECKING:
    from app.planning.application.editing import EditingRules

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
        on_submitted: Callable[[Seller, list[Projection], Seller], None] | None = None,
        rules: "EditingRules | None" = None,
        sellers: SellerRepository | None = None,
        history: ChangeLog | None = None,
    ):
        self.products, self.projections, self.clock = products, projections, clock
        self.max_days = max_days
        # Para que el supervisor registre por un vendedor; y el historial de cambios.
        self.sellers, self.history = sellers, history
        # Ventana de registro y hora de corte; la carga de ejemplos (cli seed) no la usa.
        self.rules = rules
        # Se llama tras guardar (avisos al supervisor); la carga de ejemplos no lo usa.
        self.on_submitted = on_submitted

    def __call__(
        self,
        seller: Seller,
        category: str,
        days: list[DayUnits],
        submission_id: UUID | None,
        on_behalf: str | None = None,
    ) -> list[Projection]:
        """`seller` es quien envía (sale de la sesión); `on_behalf`, el vendedor de la proyección
        cuando la registra el supervisor."""
        author, seller = seller, self._target(seller, on_behalf)
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
        result, late = [], set()
        for day in sorted(days, key=lambda d: d.date):
            if day.date < today:
                raise DomainError(f"El día {day.date:%d/%m/%Y} ya pasó.")
            if self.rules and self.rules.check(author, day.date, today, now):
                late.add(day.date)
            lines = catalog.lines_for(category, day.units)
            projection = Projection(
                uuid4(), submission, seller.username, day.date, category, lines, now
            )
            if projection.total_units == 0:
                raise DomainError(f"El día {day.date:%d/%m/%Y} no tiene unidades.")
            result.append(projection)
        changes = self._changes(author, seller, category, result, late, now)
        self.projections.replace(result)
        if self.history and changes:
            self.history.add(changes)
        logger.info(
            "Proyección %s de %s guardada: %s, %d día(s), %d unidades",
            submission,
            seller.username,
            category,
            len(result),
            sum(p.total_units for p in result),
        )
        if self.on_submitted:
            self.on_submitted(seller, result, author)
        return result

    def _target(self, author: Seller, on_behalf: str | None) -> Seller:
        """El supervisor elige el vendedor; un vendedor solo registra lo suyo."""
        if not author.is_supervisor:
            if on_behalf and on_behalf != author.username:
                raise ForbiddenError("Solo puedes registrar tus propias proyecciones.")
            return author
        if not on_behalf:
            raise DomainError("Elige el vendedor de la proyección.")
        account = self.sellers.get_account(on_behalf) if self.sellers else None
        if account is None or account.seller.is_supervisor:
            raise NotFoundError("No existe ese vendedor.")
        return account.seller

    def _changes(
        self,
        author: Seller,
        seller: Seller,
        category: str,
        saved: list[Projection],
        late: set[date],
        now: datetime,
    ) -> list[ProjectionChange]:
        """Lo que cambió respecto de lo guardado (si nada cambió, no se registra)."""
        if not self.history:
            return []
        dates = [p.date for p in saved]
        before = {
            p.date: p.units
            for p in self.projections.find(min(dates), max(dates), seller.username)
            if p.category == category
        }
        return [
            ProjectionChange(
                seller.username,
                p.date,
                category,
                author.username,
                UPDATED if p.date in before else CREATED,
                before.get(p.date),
                p.units,
                now,
                p.date in late,
            )
            for p in saved
            if before.get(p.date) != p.units
        ]


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

    def __call__(
        self, seller: Seller, category: str, start: date, days: int, on_behalf: str | None = None
    ) -> list[DailyUnits]:
        """El supervisor puede pedir la sugerencia de un vendedor (`on_behalf`)."""
        username = visible_seller(seller, on_behalf) or seller.username
        if not 1 <= days <= self.max_days:
            raise DomainError(f"Debe pedir entre 1 y {self.max_days} días.")
        Catalog(self.products.list_active()).of(category)  # valida la categoría
        dates = [start + timedelta(days=i) for i in range(days)]
        return self.forecaster.suggest(username, category, dates)


class ListChanges:
    """Historial de cambios: el vendedor ve los de sus proyecciones; el supervisor, todos."""

    def __init__(self, history: ChangeLog):
        self.history = history

    def __call__(
        self, viewer: Seller, date_from: date, date_to: date, seller: str | None
    ) -> list[ProjectionChange]:
        _check_range(date_from, date_to)
        return self.history.list(date_from, date_to, visible_seller(viewer, seller))
