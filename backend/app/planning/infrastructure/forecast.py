"""Sugerencia de la proyección.

`OrderHistoryForecaster` usa los pedidos reales del vendedor (mediana del mismo día de la
semana, el modelo elegido en el ADR 0012). Si el vendedor no tiene pedidos cargados, recurre a
`WeekdayAverageForecaster`: el promedio de sus propias proyecciones anteriores.
"""

from collections import defaultdict
from datetime import date, timedelta

from app.planning.application.ports import (
    DemandForecaster,
    OrderHistory,
    ProductRepository,
    ProjectionRepository,
)
from app.planning.domain.models import CONFIRMED, DailyUnits
from app.planning.domain.orders import (
    GENERAL_HISTORY_METHOD,
    ORDER_CATEGORY,
    PERSONAL_HISTORY_METHOD,
    daily_units,
    weekday_median,
)


class WeekdayAverageForecaster:
    name = "weekday_average"

    def __init__(self, projections: ProjectionRepository, weeks: int) -> None:
        self.projections, self.weeks = projections, weeks

    def suggest(self, seller: str, category: str, dates: list[date]) -> list[DailyUnits]:
        first = min(dates) - timedelta(weeks=self.weeks)
        history = [
            p
            for p in self.projections.find(first, max(dates) - timedelta(days=1), seller)
            if p.category == category and p.status == CONFIRMED
        ]
        result = []
        for target in dates:
            same_weekday = [
                p for p in history if p.date < target and (target - p.date).days % 7 == 0
            ][-self.weeks :]
            totals: dict[str, int] = defaultdict(int)
            for p in same_weekday:
                for pid, units in p.units.items():
                    totals[pid] += units
            n = len(same_weekday)
            result.append(
                DailyUnits(
                    seller, target, {pid: round(t / n) for pid, t in totals.items()} if n else {}
                )
            )
        return result


class OrderHistoryForecaster:
    """Mediana de lo que le pidieron al vendedor los últimos días iguales de la semana."""

    ORDERS, FALLBACK = PERSONAL_HISTORY_METHOD, "fallback"

    def __init__(
        self, orders: OrderHistory, products: ProductRepository, fallback: DemandForecaster
    ) -> None:
        self.orders, self.products, self.fallback = orders, products, fallback
        # Con qué se armó la última sugerencia (la API lo informa).
        self.name = self.ORDERS

    def suggest(self, seller: str, category: str, dates: list[date]) -> list[DailyUnits]:
        self.name = self.fallback.name
        if category != ORDER_CATEGORY:
            return self.fallback.suggest(seller, category, dates)
        products = [p for p in self.products.list_active() if p.category == category]
        history = daily_units(self.orders.lines(seller, min(dates)), products)
        result = [DailyUnits(seller, target, weekday_median(history, target)) for target in dates]
        if not any(day.units for day in result):
            return self.fallback.suggest(seller, category, dates)
        self.name = self.ORDERS
        return result


class TeamHistoryForecaster:
    """Sugerencia general: lo que pide un vendedor típico (la mediana del equipo de los últimos
    4 días iguales de la semana, repartida entre los vendedores que pidieron).

    Es para quien aún no tiene pedidos propios en ARIS (un vendedor nuevo) y para los días que
    el modelo no pronostica.
    """

    name = GENERAL_HISTORY_METHOD

    def __init__(self, orders: OrderHistory, products: ProductRepository) -> None:
        self.orders, self.products = orders, products

    def suggest(self, seller: str, category: str, dates: list[date]) -> list[DailyUnits]:
        if category != ORDER_CATEGORY:
            return [DailyUnits(seller, d, {}) for d in dates]
        lines = self.orders.team_lines(min(dates))
        team = len({who for who, _ in lines})
        products = [p for p in self.products.list_active() if p.category == category]
        history = daily_units([line for _, line in lines], products)
        result = []
        for target in dates:
            total = weekday_median(history, target)
            units = {pid: round(n / team) for pid, n in total.items()} if team else {}
            result.append(DailyUnits(seller, target, {k: v for k, v in units.items() if v > 0}))
        return result
