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
        t = dispatch_stock.c
        query = (
            select(dispatch_stock)
            .where(t.date.between(date_from, date_to))
            .order_by(t.date.desc(), t.location, t.product_id, t.lot_date)
        )
        rows = self.session.execute(query).mappings().all()
        days = []
        for day, group in groupby(rows, key=lambda r: r["date"]):
            items = list(group)
            # Quien registró lo último del día (cada ubicación se guarda por separado).
            last = max(items, key=lambda r: r["recorded_at"])
            days.append(
                DailyStock(
                    day,
                    tuple(
                        StockLine(
                            r["product_id"], r["units"], r["kg"], r["location"], r["lot_date"]
                        )
                        for r in items
                    ),
                    last["recorded_by"],
                    last["recorded_at"],
                )
            )
        return days

    def save(self, stock: DailyStock, location: str) -> None:
        t = dispatch_stock.c
        self.session.execute(
            delete(dispatch_stock).where(t.date == stock.date, t.location == location)
        )
        self.session.execute(
            insert(dispatch_stock),
            [
                {
                    "date": stock.date,
                    "product_id": line.product_id,
                    "units": line.units,
                    "kg": line.kg,
                    "location": location,
                    "lot_date": line.lot_date or stock.date,
                    "recorded_by": stock.recorded_by,
                    "recorded_at": stock.recorded_at,
                }
                for line in stock.lines
            ],
        )
        self.session.commit()
