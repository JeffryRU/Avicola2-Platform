"""Repositorio SQL de notificaciones (SQLAlchemy Core portable)."""

from datetime import UTC, datetime

from sqlalchemy import func, insert, select, update
from sqlalchemy.orm import Session

from app.planning.domain.notifications import Notification
from app.planning.infrastructure.persistence.tables import notifications, sellers


def _aware(value: datetime | None) -> datetime | None:
    # SQLite devuelve fechas sin zona: se guardan en UTC.
    return value.replace(tzinfo=UTC) if value and value.tzinfo is None else value


def _utc(value: datetime) -> datetime:
    return value.astimezone(UTC)


class SqlNotificationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def _seller_id(self, username: str) -> int | None:
        return self.session.scalar(select(sellers.c.id).where(sellers.c.username == username))

    def add(self, notification: Notification) -> Notification | None:
        seller_id = self._seller_id(notification.recipient)
        if seller_id is None:
            return None
        if notification.dedupe_key and self.session.scalar(
            select(notifications.c.id).where(
                notifications.c.seller_id == seller_id,
                notifications.c.dedupe_key == notification.dedupe_key,
            )
        ):
            return None
        # inserted_primary_key en vez de RETURNING: MySQL no lo soporta.
        new_id = self.session.execute(
            insert(notifications).values(
                seller_id=seller_id,
                kind=notification.kind,
                title=notification.title,
                body=notification.body,
                link=notification.link,
                dedupe_key=notification.dedupe_key,
                created_at=_utc(notification.created_at),
            )
        ).inserted_primary_key[0]
        self.session.commit()
        return Notification(
            notification.recipient,
            notification.kind,
            notification.title,
            notification.body,
            notification.created_at,
            notification.link,
            notification.dedupe_key,
            id=new_id,
        )

    def list_for(self, username: str, limit: int) -> list[Notification]:
        rows = self.session.execute(
            select(notifications)
            .join(sellers, sellers.c.id == notifications.c.seller_id)
            .where(sellers.c.username == username)
            .order_by(notifications.c.created_at.desc(), notifications.c.id.desc())
            .limit(limit)
        ).mappings()
        return [
            Notification(
                username,
                r["kind"],
                r["title"],
                r["body"],
                _aware(r["created_at"]),
                r["link"],
                r["dedupe_key"],
                _aware(r["read_at"]),
                r["id"],
            )
            for r in rows
        ]

    def unread_count(self, username: str) -> int:
        return self.session.scalar(
            select(func.count())
            .select_from(notifications)
            .join(sellers, sellers.c.id == notifications.c.seller_id)
            .where(sellers.c.username == username, notifications.c.read_at.is_(None))
        )

    def mark_read(self, username: str, ids: list[int] | None, now: datetime) -> int:
        seller_id = self._seller_id(username)
        if seller_id is None:
            return 0
        query = update(notifications).where(
            notifications.c.seller_id == seller_id, notifications.c.read_at.is_(None)
        )
        if ids is not None:
            query = query.where(notifications.c.id.in_(ids))
        count = self.session.execute(query.values(read_at=_utc(now))).rowcount
        self.session.commit()
        return count
