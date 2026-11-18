"""Casos de uso de la planificación de demanda (puertos de entrada).

Cada clase hace una sola cosa y recibe sus dependencias como puertos.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from uuid import UUID, uuid4

from app.planning.application.editing import EditingRules
from app.planning.application.ports import (
    ChangeLog,
    Clock,
    DemandForecaster,
    DemandModelStore,
    OrderHistory,
    ProductRepository,
    ProjectionHistory,
    ProjectionRepository,
    SalesSource,
    SellerRepository,
    StoreOrderSource,
)
from app.planning.domain.catalog import Catalog
from app.planning.domain.dates import check_range
from app.planning.domain.history import CREATED, UPDATED, ProjectionChange
from app.planning.domain.models import SELLER, DailyUnits, Product, Projection, Seller
from app.planning.domain.orders import ORDER_CATEGORY, OrderLine, daily_units, weekday_median
from app.planning.domain.permissions import Permission, require
from app.planning.domain.store_orders import StoreOrderDay, sales_zone
from app.shared.domain.errors import DomainError, ForbiddenError

logger = logging.getLogger(__name__)


class GetCatalog:
    def __init__(self, products: ProductRepository):
        self.products = products

    def __call__(self) -> list[Product]:
        return Catalog(self.products.list_active()).products


def visible_seller(viewer: Seller, requested: str | None) -> str | None:
    """Un vendedor solo ve lo suyo; el supervisor, a todos o al que filtre."""
    return requested if viewer.can(Permission.VIEW_TEAM) else viewer.username


class ListSellers:
    def __init__(self, sellers: SellerRepository):
        self.sellers = sellers

    def __call__(self, viewer: Seller) -> list[Seller]:
        if not viewer.can(Permission.VIEW_TEAM):
            return [viewer]
        return [s for s in self.sellers.list_active() if s.role == SELLER]


class ListProjections:
    """Las proyecciones de la app y, en los días que no tienen, la historia (lo pedido en ARIS)."""

    def __init__(self, projections: ProjectionRepository, history: ProjectionHistory | None = None):
        self.projections, self.history = projections, history

    def __call__(
        self, viewer: Seller, date_from: date, date_to: date, seller: str | None
    ) -> list[Projection]:
        check_range(date_from, date_to)
        who = visible_seller(viewer, seller)
        found = self.projections.find(date_from, date_to, who)
        if self.history is None:
            return found
        taken = {(p.seller, p.date) for p in found}
        past = [
            p
            for p in self.history.projections(date_from, date_to, who)
            if (p.seller, p.date) not in taken
        ]
        return found + past


@dataclass(frozen=True)
class DayUnits:
    date: date
    units: dict[str, int]


REVIEW_ONLY = "La supervisión revisa las proyecciones; cada vendedor registra las suyas."


class SubmitProjection:
    """Guarda la proyección de cada día enviado. Si el día ya tenía una, el registro nuevo es
    otra hoja que la reemplaza (INS-06): vale la última y el historial conserva las anteriores."""

    def __init__(
        self,
        products: ProductRepository,
        projections: ProjectionRepository,
        clock: Clock,
        max_days: int,
        on_submitted: Callable[[Seller, list[Projection]], None] | None = None,
        rules: EditingRules | None = None,
        history: ChangeLog | None = None,
        projected: frozenset[str] | None = None,
        projected_products: frozenset[str] = frozenset(),
    ):
        self.products, self.projections, self.clock = products, projections, clock
        self.max_days = max_days
        # Categorías que se proyectan; None = todas (la carga de ejemplos no la usa). Además,
        # productos sueltos de otras categorías (p. ej. el pollo sin menudencia).
        self.projected = projected
        self.projected_products = projected_products
        # Historial de cambios; la carga de ejemplos (cli seed) no lo usa.
        self.history = history
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
        """`seller` es quien envía (sale de la sesión); `on_behalf`, solo si es él mismo."""
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
        allowed = self._allowed(catalog, category)
        submission = submission_id or uuid4()
        current = self._current(seller, category, [d.date for d in days])
        result, late = [], set()
        for day in sorted(days, key=lambda d: d.date):
            if day.date < today:
                raise DomainError(f"El día {day.date:%d/%m/%Y} ya pasó.")
            if self.rules and self.rules.check(author, day.date, today, now):
                late.add(day.date)
            lines = catalog.lines_for(category, day.units, allowed)
            projection = Projection(
                uuid4(), submission, seller.username, day.date, category, lines, now
            )
            if projection.total_units == 0:
                raise DomainError(f"El día {day.date:%d/%m/%Y} no tiene unidades.")
            before = current.get(day.date)
            if before:
                # Reenviar lo mismo no abre una hoja nueva.
                same = before.units == projection.units
                projection = replace(projection, sheet=before.sheet + (0 if same else 1))
            result.append(projection)
        changes = self._changes(author, seller, category, result, current, late, now)
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
            self.on_submitted(seller, result)
        return result

    def _allowed(self, catalog: Catalog, category: str) -> list[str] | None:
        """Los productos de la categoría que se proyectan (None = todos los de la categoría)."""
        if self.projected is None or category in self.projected:
            return None
        allowed = [pid for pid in catalog.of(category) if pid in self.projected_products]
        if not allowed:
            raise DomainError(f"La categoría {category} no se proyecta.")
        return allowed

    def _target(self, author: Seller, on_behalf: str | None) -> Seller:
        """Solo el vendedor registra, y solo lo suyo. Registrar es la tarea del rol vendedor, no un
        permiso: la supervisión revisa (ve al equipo, habilita la edición), pero no registra."""
        if not author.is_seller:
            if author.can(Permission.VIEW_TEAM):
                raise ForbiddenError(REVIEW_ONLY)
            # P. ej., el jefe de despacho: tiene cuenta, pero no proyecta.
            raise ForbiddenError("Tu rol no registra proyecciones.")
        if on_behalf and on_behalf != author.username:
            raise ForbiddenError("Solo puedes registrar tus propias proyecciones.")
        return author

    def _current(self, seller: Seller, category: str, dates: list[date]) -> dict[date, Projection]:
        """La proyección vigente de cada día enviado (la hoja anterior, si existe)."""
        found = self.projections.find(min(dates), max(dates), seller.username)
        return {p.date: p for p in found if p.category == category}

    def _changes(
        self,
        author: Seller,
        seller: Seller,
        category: str,
        saved: list[Projection],
        current: dict[date, Projection],
        late: set[date],
        now: datetime,
    ) -> list[ProjectionChange]:
        """Lo que cambió respecto de lo guardado (si nada cambió, no se registra)."""
        if not self.history:
            return []
        before = {day: p.units for day, p in current.items()}
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
                sheet=p.sheet,
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
        check_range(date_from, date_to)
        return self.sales.daily_units(date_from, date_to, visible_seller(viewer, seller))


class GetStoreOrders:
    """Lo que piden las tiendas por zona y día, en unidades de los productos de brasa."""

    def __init__(
        self, source: StoreOrderSource, sellers: SellerRepository, products: ProductRepository
    ):
        self.source, self.sellers, self.products = source, sellers, products

    def __call__(self, viewer: Seller, date_from: date, date_to: date) -> list[StoreOrderDay]:
        require(viewer.role, Permission.VIEW_TEAM)
        check_range(date_from, date_to)
        zones = sorted({s.zone for s in self.sellers.list_active() if s.zone})
        products = [p for p in self.products.list_active() if p.category == ORDER_CATEGORY]
        by_zone: dict[str | None, list[OrderLine]] = {}
        for raw, line in self.source.lines(date_from, date_to):
            by_zone.setdefault(sales_zone(raw, zones), []).append(line)
        out = []
        for zone, lines in sorted(by_zone.items(), key=lambda kv: kv[0] or ""):
            for day, units in sorted(daily_units(lines, products).items()):
                rounded = {pid: round(n) for pid, n in units.items() if round(n) > 0}
                if rounded:
                    out.append(StoreOrderDay(zone, day, rounded))
        return out


class SuggestProjection:
    """Sugerencia: la del modelo entrenado (el elegido para sugerir, ADR 0020) si ya
    pronosticó esos días; si no, la del pronosticador (mediana de 4 semanas o promedio propio)."""

    STORED_METHOD = "modelo_entrenado"

    def __init__(
        self,
        products: ProductRepository,
        forecaster: DemandForecaster,
        max_days: int,
        store: DemandModelStore | None = None,
    ):
        self.products, self.forecaster, self.max_days = products, forecaster, max_days
        self.store = store
        # Con qué se armó la última sugerencia (la API lo informa).
        self.method = forecaster.name

    def __call__(
        self, seller: Seller, category: str, start: date, days: int, on_behalf: str | None = None
    ) -> list[DailyUnits]:
        """El supervisor puede pedir la sugerencia de un vendedor (`on_behalf`)."""
        username = visible_seller(seller, on_behalf) or seller.username
        if not 1 <= days <= self.max_days:
            raise DomainError(f"Debe pedir entre 1 y {self.max_days} días.")
        ids = set(Catalog(self.products.list_active()).of(category))  # valida la categoría
        dates = [start + timedelta(days=i) for i in range(days)]
        if self.store:
            # El modelo guarda, por vendedor y día, todos los productos que aprende (la brasa y el
            # pollo sin menudencia): de cada día se toman solo los de esta categoría.
            model = suggestion_model(self.store)
            stored = (
                {
                    d.date: {pid: n for pid, n in d.units.items() if pid in ids}
                    for d in self.store.predictions(model, dates[0], dates[-1], username)
                }
                if model
                else {}
            )
            if stored and all(d in stored for d in dates) and any(stored.values()):
                self.method = self.STORED_METHOD
                return [DailyUnits(username, d, stored[d]) for d in dates]
        result = self.forecaster.suggest(username, category, dates)
        self.method = self.forecaster.name
        return result


# Hasta cuántos días se le pide al modelo de una vez (un año, como los dashboards).
MODEL_MAX_DAYS = 366


class ModelProjections:
    """Lo que el modelo (ADR 0012: mediana de los pedidos de los últimos 4 días iguales de la
    semana) habría sugerido cada día, con solo la historia anterior a ese día. Sirve para
    comparar, en los dashboards, el modelo con lo que proyectó el vendedor y lo que se vendió."""

    def __init__(
        self,
        sellers: SellerRepository,
        orders: OrderHistory,
        products: ProductRepository,
        store: DemandModelStore | None = None,
    ):
        self.sellers, self.orders, self.products = sellers, orders, products
        self.store = store

    def __call__(
        self, viewer: Seller, date_from: date, date_to: date, seller: str | None
    ) -> list[DailyUnits]:
        check_range(date_from, date_to)
        if (date_to - date_from).days >= MODEL_MAX_DAYS:
            raise DomainError(f"Pide hasta {MODEL_MAX_DAYS} días del modelo.")
        who = visible_seller(viewer, seller)
        team = [who] if who else [s.username for s in self.sellers.list_active() if s.is_seller]
        # Los días que evaluó el modelo entrenado (ADR 0020) traen la predicción guardada del
        # modelo elegido para la sugerencia; el resto, la mediana de 4 semanas.
        model = suggestion_model(self.store) if self.store else None
        stored = (
            [d for d in self.store.predictions(model, date_from, date_to, who) if d.seller in team]
            if self.store and model
            else []
        )
        covered = {d.date for d in stored}
        products = [p for p in self.products.list_active() if p.category == ORDER_CATEGORY]
        days = [date_from + timedelta(days=i) for i in range((date_to - date_from).days + 1)]
        out = []
        for name in team:
            history = daily_units(self.orders.lines(name, date_to + timedelta(days=1)), products)
            if not history:
                continue
            for day in days:
                if day in covered:
                    continue
                units = weekday_median(history, day)
                if units:
                    out.append(DailyUnits(name, day, units))
        return stored + out


def suggestion_model(store: "DemandModelStore") -> str | None:
    """El modelo que la última corrida eligió para la sugerencia (el de menor error por vendedor
    y día); None si todavía no se entrenó."""
    latest = store.latest()
    return latest.get("chosen", {}).get("sugerencia") if latest else None


class GetModelSummary:
    """Métricas de la última corrida del modelo de demanda (pantalla «Modelo»)."""

    def __init__(self, store: DemandModelStore):
        self.store = store

    def __call__(self, viewer: Seller) -> dict | None:
        require(viewer.role, Permission.VIEW_TEAM)
        return self.store.latest()


class ListChanges:
    """Historial de cambios: el vendedor ve los de sus proyecciones; el supervisor, todos."""

    def __init__(self, history: ChangeLog):
        self.history = history

    def __call__(
        self, viewer: Seller, date_from: date, date_to: date, seller: str | None
    ) -> list[ProjectionChange]:
        check_range(date_from, date_to)
        return self.history.list(date_from, date_to, visible_seller(viewer, seller))
