"""Repositorios SQL de la planificación: SQLAlchemy Core portable, sirve para cualquier motor."""

from collections import defaultdict
from datetime import UTC, date, datetime

from sqlalchemy import delete, insert, or_, select, update
from sqlalchemy.orm import Session

from app.planning.domain.accounts import AccountChange, ChangeOutcome
from app.planning.domain.models import Product, Projection, ProjectionLine, Seller, SellerAccount
from app.planning.infrastructure.persistence.tables import (
    products,
    projection_lines,
    projections,
    sellers,
)
from app.shared.domain.errors import DomainError


class SqlProductRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_active(self) -> list[Product]:
        rows = self.session.execute(
            select(products).where(products.c.is_active.is_(True))
        ).mappings()
        return [
            Product(
                r["id"],
                r["category"],
                r["name"],
                float(r["kg_per_unit"]),
                r["sort_order"],
                r["subcategory"],
            )
            for r in rows
        ]


def _seller(row) -> Seller:
    return Seller(row["username"], row["name"], row["zone"], row["role"])


def _aware(value: datetime | None) -> datetime | None:
    # SQLite devuelve fechas sin zona: se guardan en UTC.
    return value.replace(tzinfo=UTC) if value and value.tzinfo is None else value


def _account(row) -> SellerAccount:
    return SellerAccount(
        _seller(row),
        row["password_hash"],
        must_change_password=row["must_change_password"],
        failed_logins=row["failed_logins"],
        locked_until=_aware(row["locked_until"]),
        token_version=row["token_version"],
        is_active=row["is_active"],
    )


def _security_values(account: SellerAccount) -> dict:
    locked = account.locked_until
    return {
        "password_hash": account.password_hash,
        "must_change_password": account.must_change_password,
        "failed_logins": account.failed_logins,
        "locked_until": locked.astimezone(UTC) if locked else None,
        "token_version": account.token_version,
        "is_active": account.is_active,
    }


class SqlSellerRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_account(self, username: str, active_only: bool = True) -> SellerAccount | None:
        query = select(sellers).where(sellers.c.username == username)
        if active_only:
            query = query.where(sellers.c.is_active.is_(True))
        row = self.session.execute(query).mappings().first()
        return _account(row) if row else None

    def list_accounts(self) -> list[SellerAccount]:
        rows = self.session.execute(select(sellers).order_by(sellers.c.id)).mappings()
        return [_account(r) for r in rows]

    def create(self, account: SellerAccount) -> None:
        s = account.seller
        self.session.execute(
            insert(sellers).values(
                username=s.username,
                name=s.name,
                zone=s.zone,
                role=s.role,
                **_security_values(account),
            )
        )
        self.session.commit()

    def save_security(self, account: SellerAccount, expected_version: int) -> bool:
        values = _security_values(account)
        del values["is_active"]  # el estado solo lo cambia `apply` (administración)
        result = self.session.execute(
            update(sellers)
            .where(
                sellers.c.username == account.seller.username,
                sellers.c.token_version == expected_version,
            )
            .values(values)
        )
        self.session.commit()
        return result.rowcount == 1

    def apply(self, change: AccountChange) -> ChangeOutcome:
        try:
            outcome = self._apply(change)
        except Exception:
            self.session.rollback()
            raise
        if outcome is ChangeOutcome.APPLIED:
            self.session.commit()
        else:
            self.session.rollback()
        return outcome

    def _apply(self, change: AccountChange) -> ChangeOutcome:
        # Bloquea (en orden fijo, sin interbloqueos) al actor, a la cuenta destino y a todas las
        # cuentas del rol que no puede quedar vacío: dos peticiones simultáneas que se degradan
        # mutuamente se ejecutan una tras otra, y la segunda ve lo que hizo la primera.
        names = [change.target, *([change.actor] if change.actor else [])]
        rows = {
            r["username"]: r
            for r in self.session.execute(
                select(sellers)
                .where(or_(sellers.c.username.in_(names), sellers.c.role == change.keep_one_active))
                .order_by(sellers.c.username)
                .with_for_update()
            ).mappings()
        }
        target = rows.get(change.target)
        if target is None:
            return ChangeOutcome.NOT_FOUND
        if change.actor is not None:
            actor = rows.get(change.actor)
            if (
                actor is None
                or not actor["is_active"]
                or actor["role"] != change.actor_role
                or actor["token_version"] != change.actor_version
            ):
                return ChangeOutcome.ACTOR_CHANGED
        if target["role"] not in change.target_roles:
            return ChangeOutcome.TARGET_CHANGED
        if change.removes_guardian(target["role"], target["is_active"]):
            others = [
                r
                for name, r in rows.items()
                if name != change.target and r["role"] == change.keep_one_active and r["is_active"]
            ]
            if not others:
                return ChangeOutcome.LAST_GUARDIAN

        values: dict = {}
        if change.role is not None:
            values["role"] = change.role
        if change.active is not None:
            values["is_active"] = change.active
        if change.password_hash is not None:
            values.update(
                password_hash=change.password_hash,
                must_change_password=True,
                failed_logins=0,
                locked_until=None,
            )
        if change.revoke_sessions:
            values["token_version"] = sellers.c.token_version + 1
        if values:
            self.session.execute(
                update(sellers).where(sellers.c.username == change.target).values(values)
            )
        return ChangeOutcome.APPLIED

    def save_profile(self, seller: Seller) -> None:
        self.session.execute(
            update(sellers)
            .where(sellers.c.username == seller.username)
            .values(name=seller.name, zone=seller.zone)
        )
        self.session.commit()

    def list_active(self) -> list[Seller]:
        rows = self.session.execute(
            select(sellers).where(sellers.c.is_active.is_(True)).order_by(sellers.c.id)
        ).mappings()
        return [_seller(r) for r in rows]


class SqlProjectionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def find(self, date_from: date, date_to: date, seller: str | None = None) -> list[Projection]:
        query = (
            select(projections, sellers.c.username)
            .join(sellers, sellers.c.id == projections.c.seller_id)
            .where(projections.c.date.between(date_from, date_to))
            .order_by(projections.c.date, sellers.c.username)
        )
        if seller:
            query = query.where(sellers.c.username == seller)
        heads = self.session.execute(query).mappings().all()
        lines: dict = defaultdict(list)
        ids = [h["id"] for h in heads]
        for chunk in (ids[i : i + 500] for i in range(0, len(ids), 500)):
            for r in self.session.execute(
                select(projection_lines).where(projection_lines.c.projection_id.in_(chunk))
            ).mappings():
                lines[r["projection_id"]].append(
                    ProjectionLine(r["product_id"], r["units"], float(r["kg"]))
                )
        return [
            Projection(
                id=h["id"],
                submission_id=h["submission_id"],
                seller=h["username"],
                date=h["date"],
                category=h["category"],
                lines=tuple(lines[h["id"]]),
                submitted_at=h["updated_at"] or h["submitted_at"],
                status=h["status"],
            )
            for h in heads
        ]

    def replace(self, items: list[Projection]) -> None:
        try:
            self._write(items)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise

    def _write(self, items: list[Projection]) -> None:
        seller_ids = self._seller_ids({p.seller for p in items})
        for p in items:
            key = (
                projections.c.seller_id == seller_ids[p.seller],
                projections.c.date == p.date,
                projections.c.category == p.category,
            )
            current = self.session.execute(
                select(projections.c.id).where(*key).with_for_update()
            ).scalar()
            values = {
                "submission_id": p.submission_id,
                "status": p.status,
                "total_units": p.total_units,
                "total_kg": p.total_kg,
            }
            if current is None:
                current = p.id
                self.session.execute(
                    insert(projections).values(
                        id=current,
                        seller_id=seller_ids[p.seller],
                        date=p.date,
                        category=p.category,
                        submitted_at=p.submitted_at,
                        **values,
                    )
                )
            else:
                self.session.execute(
                    update(projections)
                    .where(projections.c.id == current)
                    .values(updated_at=p.submitted_at, **values)
                )
                self.session.execute(
                    delete(projection_lines).where(projection_lines.c.projection_id == current)
                )
            self.session.execute(
                insert(projection_lines),
                [
                    {
                        "projection_id": current,
                        "product_id": ln.product_id,
                        "units": ln.units,
                        "kg": ln.kg,
                    }
                    for ln in p.lines
                ],
            )

    def _seller_ids(self, usernames: set[str]) -> dict[str, int]:
        rows = self.session.execute(
            select(sellers.c.username, sellers.c.id).where(sellers.c.username.in_(usernames))
        ).all()
        found = dict(rows)
        if missing := usernames - set(found):
            raise DomainError(f"El vendedor no existe: {', '.join(sorted(missing))}.")
        return found
