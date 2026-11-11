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
from app.planning.domain.orders import ORDER_CATEGORY, daily_units, weekday_median


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

    ORDERS, FALLBACK = "order_history_median", "fallback"

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
