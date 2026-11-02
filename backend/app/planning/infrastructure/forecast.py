"""Sugerencia base: promedio del mismo día de la semana en las últimas semanas del vendedor.

Es el punto de enganche del modelo de ML: otro adaptador de DemandForecaster (que lea el
forecast del lakehouse) lo reemplaza sin tocar los casos de uso ni la API.
"""

from collections import defaultdict
from datetime import date, timedelta

from app.planning.application.ports import ProjectionRepository
from app.planning.domain.models import CONFIRMED, DailyUnits


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
