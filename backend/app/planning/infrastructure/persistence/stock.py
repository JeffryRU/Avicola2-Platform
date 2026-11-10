"""Repositorio SQL del stock de despacho."""

from datetime import date
from itertools import groupby

from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.planning.domain.stock import DailyStock, StockLine
from app.planning.infrastructure.persistence.tables import dispatch_stock


class SqlStockRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def find(self, date_from: date, date_to: date) -> list[DailyStock]:
        query = (
            select(dispatch_stock)
            .where(dispatch_stock.c.date.between(date_from, date_to))
            .order_by(dispatch_stock.c.date.desc(), dispatch_stock.c.product_id)
        )
        rows = self.session.execute(query).mappings().all()
        days = []
        for day, group in groupby(rows, key=lambda r: r["date"]):
            items = list(group)
            days.append(
                DailyStock(
                    day,
                    tuple(StockLine(r["product_id"], r["units"], r["kg"]) for r in items),
                    items[0]["recorded_by"],
                    items[0]["recorded_at"],
                )
            )
        return days

    def save(self, stock: DailyStock) -> None:
        self.session.execute(delete(dispatch_stock).where(dispatch_stock.c.date == stock.date))
        self.session.execute(
            insert(dispatch_stock),
            [
                {
                    "date": stock.date,
                    "product_id": line.product_id,
                    "units": line.units,
                    "kg": line.kg,
                    "recorded_by": stock.recorded_by,
                    "recorded_at": stock.recorded_at,
                }
                for line in stock.lines
            ],
        )
        self.session.commit()
