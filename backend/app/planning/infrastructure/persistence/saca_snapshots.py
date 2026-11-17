"""Sacas guardadas (una por día)."""

from datetime import UTC, date, datetime

from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.planning.domain.saca import SacaSnapshot
from app.planning.infrastructure.persistence.tables import saca_snapshots


def _aware(value: datetime) -> datetime:
    # SQLite devuelve fechas sin zona: se guardan en UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _snapshot(row) -> SacaSnapshot:
    return SacaSnapshot(
        row["date"], _aware(row["saved_at"]), row["saved_by"], row["farm_order"], row["payload"]
    )


class SqlSacaSnapshotRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save(self, snapshot: SacaSnapshot) -> None:
        t = saca_snapshots
        self.session.execute(delete(t).where(t.c.date == snapshot.date))
        self.session.execute(
            insert(t).values(
                date=snapshot.date,
                saved_at=snapshot.saved_at,
                saved_by=snapshot.saved_by,
                farm_order=snapshot.farm_order,
                payload=snapshot.payload,
            )
        )
        self.session.commit()

    def get(self, day: date) -> SacaSnapshot | None:
        row = (
            self.session.execute(select(saca_snapshots).where(saca_snapshots.c.date == day))
            .mappings()
            .first()
        )
        return _snapshot(row) if row else None

    def find(self, date_from: date, date_to: date) -> list[SacaSnapshot]:
        t = saca_snapshots.c
        rows = self.session.execute(
            select(saca_snapshots).where(t.date.between(date_from, date_to)).order_by(t.date.desc())
        ).mappings()
        return [_snapshot(r) for r in rows]
