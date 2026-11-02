"""Venta real SIMULADA, igual que en el mockup: aún no hay conexión con el ERP.

Para cada día pasado con proyección confirmada genera una venta entre el 90 % y el 102 % de lo
proyectado, determinística (misma fecha y producto, mismo valor). Reemplazar por un adaptador
del ERP o del lakehouse (gold) cuando exista, sin tocar los casos de uso.
"""

import hashlib
from datetime import date

from app.planning.application.ports import Clock, ProjectionRepository
from app.planning.domain.models import CONFIRMED, DailyUnits


def _fraction(key: str) -> float:
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


class SimulatedSalesSource:
    def __init__(self, projections: ProjectionRepository, clock: Clock) -> None:
        self.projections, self.clock = projections, clock

    def daily_units(self, date_from: date, date_to: date, seller: str | None) -> list[DailyUnits]:
        today = self.clock.today()
        return [
            DailyUnits(
                p.seller,
                p.date,
                {
                    pid: max(0, round(u * (0.9 + _fraction(f"{p.date}{pid}{p.seller}") * 0.12)))
                    for pid, u in p.units.items()
                },
            )
            for p in self.projections.find(date_from, date_to, seller)
            if p.status == CONFIRMED and p.date < today
        ]
