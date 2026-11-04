"""Repositorios SQL de ajustes y habilitaciones de edición."""

from datetime import date, datetime

from sqlalchemy import insert, select, update
from sqlalchemy.orm import Session

from app.planning.domain.editing import EditUnlock
from app.planning.infrastructure.persistence.tables import edit_unlocks, sellers, settings
from app.shared.domain.errors import DomainError


class SqlSettingsRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, key: str) -> str | None:
        return self.session.scalar(select(settings.c.value).where(settings.c.key == key))

    def set(self, key: str, value: str, updated_by: str, updated_at: datetime) -> None:
        values = {"value": value, "updated_by": updated_by, "updated_at": updated_at}
        if self.get(key) is None:
            self.session.execute(insert(settings).values(key=key, **values))
        else:
            self.session.execute(update(settings).where(settings.c.key == key).values(values))
        self.session.commit()


def _unlock(row) -> EditUnlock:
    return EditUnlock(
        seller=row["username"],
        date=row["date"],
        reason=row["reason"],
        status=row["status"],
        requested_at=row["requested_at"],
        decided_by=row["decided_by"],
        decided_at=row["decided_at"],
        id=row["id"],
    )


class SqlUnlockRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def _query(self):
        return select(edit_unlocks, sellers.c.username).join(
            sellers, sellers.c.id == edit_unlocks.c.seller_id
        )

    def add(self, unlock: EditUnlock) -> EditUnlock:
        seller_id = self.session.scalar(
            select(sellers.c.id).where(sellers.c.username == unlock.seller)
        )
        if seller_id is None:
            raise DomainError(f"No existe el vendedor {unlock.seller}.")
        new_id = self.session.execute(
            insert(edit_unlocks).values(
                seller_id=seller_id,
                date=unlock.date,
                reason=unlock.reason,
                status=unlock.status,
                requested_at=unlock.requested_at,
            )
        ).inserted_primary_key[0]
        self.session.commit()
        return EditUnlock(
            unlock.seller, unlock.date, unlock.reason, unlock.status, unlock.requested_at, id=new_id
        )

    def get(self, unlock_id: int) -> EditUnlock | None:
        row = (
            self.session.execute(self._query().where(edit_unlocks.c.id == unlock_id))
            .mappings()
            .first()
        )
        return _unlock(row) if row else None

    def latest(self, seller: str, day: date) -> EditUnlock | None:
        row = (
            self.session.execute(
                self._query()
                .where(sellers.c.username == seller, edit_unlocks.c.date == day)
                .order_by(edit_unlocks.c.id.desc())
            )
            .mappings()
            .first()
        )
        return _unlock(row) if row else None

    def list_since(self, since: date, seller: str | None) -> list[EditUnlock]:
        query = self._query().where(edit_unlocks.c.date >= since).order_by(edit_unlocks.c.id.desc())
        if seller:
            query = query.where(sellers.c.username == seller)
        return [_unlock(r) for r in self.session.execute(query).mappings()]

    def save(self, unlock: EditUnlock) -> None:
        self.session.execute(
            update(edit_unlocks)
            .where(edit_unlocks.c.id == unlock.id)
            .values(
                status=unlock.status, decided_by=unlock.decided_by, decided_at=unlock.decided_at
            )
        )
        self.session.commit()
