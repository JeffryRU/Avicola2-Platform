"""Repositorio SQL del historial de cambios de las proyecciones."""

import json
from datetime import date

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.planning.domain.history import ProjectionChange
from app.planning.infrastructure.persistence.tables import projection_changes, sellers


def _units(raw: str | None) -> dict[str, int] | None:
    return None if raw is None else {k: int(v) for k, v in json.loads(raw).items()}


class SqlChangeLog:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, changes: list[ProjectionChange]) -> None:
        names = {c.seller for c in changes}
        query = select(sellers.c.username, sellers.c.id).where(sellers.c.username.in_(names))
        ids = {row.username: row.id for row in self.session.execute(query)}
        self.session.execute(
            insert(projection_changes),
            [
                {
                    "seller_id": ids[c.seller],
                    "date": c.date,
                    "category": c.category,
                    "author": c.author,
                    "action": c.action,
                    "before_units": None if c.before is None else json.dumps(c.before),
                    "after_units": json.dumps(c.after),
                    "before_total": c.before_total,
                    "after_total": c.after_total,
                    "after_cutoff": c.after_cutoff,
                    "sheet": c.sheet,
                    "changed_at": c.changed_at,
                    "changed_on": c.changed_at.date(),
                }
                for c in changes
            ],
        )
        self.session.commit()

    def list(self, date_from: date, date_to: date, seller: str | None) -> list[ProjectionChange]:
        query = (
            select(projection_changes, sellers.c.username)
            .join(sellers, sellers.c.id == projection_changes.c.seller_id)
            .where(projection_changes.c.changed_on.between(date_from, date_to))
            .order_by(projection_changes.c.id.desc())
        )
        if seller:
            query = query.where(sellers.c.username == seller)
        return [
            ProjectionChange(
                seller=r["username"],
                date=r["date"],
                category=r["category"],
                author=r["author"],
                action=r["action"],
                before=_units(r["before_units"]),
                after=_units(r["after_units"]) or {},
                changed_at=r["changed_at"],
                after_cutoff=r["after_cutoff"],
                id=r["id"],
                sheet=r["sheet"],
            )
            for r in self.session.execute(query).mappings()
        ]
