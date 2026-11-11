"""Repositorio SQL de la producción diaria."""

from datetime import date
from itertools import groupby

from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.planning.domain.production import DailyProduction, ProductionLine
from app.planning.infrastructure.persistence.tables import production


class SqlProductionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def find(self, date_from: date, date_to: date) -> list[DailyProduction]:
        query = (
            select(production)
            .where(production.c.date.between(date_from, date_to))
            .order_by(production.c.date.desc(), production.c.product_id)
        )
        rows = self.session.execute(query).mappings().all()
        days = []
        for day, group in groupby(rows, key=lambda r: r["date"]):
            items = list(group)
            lines = tuple(
                ProductionLine(r["product_id"], r["ordered"], r["produced"], r["quality_b"])
                for r in items
            )
            days.append(
                DailyProduction(day, lines, items[0]["recorded_by"], items[0]["recorded_at"])
            )
        return days

    def save(self, production_day: DailyProduction) -> None:
        self.write(production_day)
        self.session.commit()

    def write(self, production_day: DailyProduction) -> None:
        """Sin confirmar la transacción: la importación de un Excel guarda muchos días juntos."""
        self.session.execute(delete(production).where(production.c.date == production_day.date))
        self.session.execute(
            insert(production),
            [
                {
                    "date": production_day.date,
                    "product_id": line.product_id,
                    "ordered": line.ordered,
                    "produced": line.produced,
                    "quality_b": line.quality_b,
                    "recorded_by": production_day.recorded_by,
                    "recorded_at": production_day.recorded_at,
                }
                for line in production_day.lines
            ],
        )
