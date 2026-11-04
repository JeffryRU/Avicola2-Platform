"""Comandos de consola de la planificación (equivalen a los `npm run db:*` del mockup).

    uv run python -m app.planning.infrastructure.cli init         productos (+ usuarios de prueba)
    uv run python -m app.planning.infrastructure.cli supervisor <usuario> "<nombre>"
                                                        primer supervisor, con contraseña temporal
    uv run python -m app.planning.infrastructure.cli vendedores [--simple] [--reset]
                        vendedores de la tabla maestra con contraseña temporal
                        (--simple: <usuario>2026; --reset: también a los que ya existen)
    uv run python -m app.planning.infrastructure.cli seed         3 semanas de ejemplo
    uv run python -m app.planning.infrastructure.cli show [n]     resumen y últimas n
    uv run python -m app.planning.infrastructure.cli clear --yes  borra las proyecciones

Las tablas las crea Alembic (`uv run alembic upgrade head`).
"""

import os
import random
import sys
from dataclasses import replace
from datetime import UTC, date, datetime, time, timedelta

import yaml
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.planning.application.use_cases import DayUnits, SubmitProjection
from app.planning.domain.accounts import check_username
from app.planning.domain.models import SELLER, SUPERVISOR, Seller, SellerAccount
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.persistence.repositories import (
    SqlProductRepository,
    SqlProjectionRepository,
    SqlSellerRepository,
)
from app.planning.infrastructure.persistence.tables import (
    products,
    projection_lines,
    projections,
    sellers,
)
from app.planning.infrastructure.security import RandomTemporaryPasswords, ScryptPasswordHasher
from app.shared.infrastructure.database.session import SessionLocal
from app.shared.infrastructure.logging.setup import configure_from_settings

# Unidades base por día de la semana (lun..dom) para BRASA 1..10, como en el mockup.
BASE = [
    [10, 15, 20, 12, 25, 18, 10, 14, 8, 5],
    [8, 12, 18, 10, 20, 15, 8, 12, 6, 4],
    [12, 18, 20, 15, 30, 22, 12, 18, 10, 6],
    [10, 15, 18, 14, 28, 20, 10, 16, 8, 6],
    [14, 20, 24, 16, 32, 24, 12, 18, 10, 7],
    [16, 22, 26, 18, 35, 26, 14, 20, 12, 8],
    [12, 16, 20, 12, 26, 18, 10, 14, 8, 5],
]
SELLER_FACTOR = {
    "rnavarro": 1.0,
    "hdias": 0.82,
    "mcordova": 1.16,
    "gfernandez": 0.7,
    "jgonzales": 0.9,
    "cvillalobos": 1.05,
    "eauleste": 0.95,
}


def init(session: Session, settings: Settings) -> None:
    """Carga o actualiza productos y vendedores desde config/planning_seed.yaml (idempotente)."""
    with (settings.config_dir / "planning_seed.yaml").open(encoding="utf-8") as fh:
        seed = yaml.safe_load(fh)
    order = 0
    for category, items in seed["products"].items():
        for item in items:
            values = {
                "category": category,
                "subcategory": item.get("subcategory"),
                "name": item["name"],
                "kg_per_unit": item["kg_per_unit"],
                "sort_order": order,
                "is_active": True,
            }
            exists = session.scalar(select(products.c.id).where(products.c.id == item["id"]))
            if exists:
                session.execute(update(products).where(products.c.id == item["id"]).values(values))
            else:
                session.execute(insert(products).values(id=item["id"], **values))
            order += 1
    # Lo que salió del catálogo se desactiva: las proyecciones antiguas lo siguen referenciando.
    kept = [item["id"] for items in seed["products"].values() for item in items]
    session.execute(update(products).where(products.c.id.not_in(kept)).values(is_active=False))
    session.commit()
    print(f"OK: {order} productos listos.")
    if not settings.is_local:
        # Fuera de local no se crean cuentas con contraseña conocida.
        print("Usuarios de prueba omitidos (APP_ENV no es local). Crea el primer supervisor con:")
        print('  python -m app.planning.infrastructure.cli supervisor <usuario> "<nombre>"')
        return
    password = os.environ.get("PLANNING_DEMO_PASSWORD", "demo1234")
    hasher = ScryptPasswordHasher()
    for s in seed["users"]:
        if not session.scalar(select(sellers.c.id).where(sellers.c.username == s["username"])):
            session.execute(
                insert(sellers).values(
                    username=s["username"],
                    name=s["name"],
                    zone=s.get("zone"),
                    role=s.get("role", SELLER),
                    password_hash=hasher.hash(password),
                    is_active=True,
                )
            )
    session.commit()
    print(f"OK: {len(seed['users'])} usuarios de prueba listos (solo local).")


def create_supervisor(session: Session, username: str, name: str) -> None:
    """Primer supervisor: luego él crea las demás cuentas desde la app."""
    check_username(username)
    repo = SqlSellerRepository(session)
    if repo.get_account(username, active_only=False):
        print(f"El usuario {username} ya existe.")
        return
    temporary = RandomTemporaryPasswords().generate()
    repo.create(
        SellerAccount(
            Seller(username, name, None, SUPERVISOR),
            ScryptPasswordHasher().hash(temporary),
            must_change_password=True,
        )
    )
    print(f"OK: supervisor {username} creado. Contraseña temporal (se pide cambiarla al entrar):")
    print(f"  {temporary}")


# Temporal y obligada a cambiarse al entrar (la política rechaza contraseñas con el usuario).
SIMPLE_PASSWORD_SUFFIX = "2026"  # noqa: S105


def create_sellers(
    session: Session, settings: Settings, *, simple: bool = False, reset: bool = False
) -> None:
    """Vendedores de config/planning_seed.yaml (U0001..U0007), con contraseña temporal.

    Sirve en producción: imprime usuario y contraseña de cada uno, y al entrar se les pide
    cambiarla. `simple` usa <usuario>2026 (fácil de dictar en una entrevista); `reset` también
    restablece a los que ya existen y cierra sus sesiones abiertas.
    """
    with (settings.config_dir / "planning_seed.yaml").open(encoding="utf-8") as fh:
        seed = yaml.safe_load(fh)
    repo, hasher, passwords = (
        SqlSellerRepository(session),
        ScryptPasswordHasher(),
        RandomTemporaryPasswords(),
    )
    rows: list[tuple[str, str, str, str]] = []
    for s in seed["users"]:
        if s.get("role", SELLER) != SELLER:
            continue
        username = s["username"]
        check_username(username)
        existing = repo.get_account(username, active_only=False)
        if existing and not reset:
            rows.append((username, "(ya existe, sin cambios)", s["name"], s.get("zone") or ""))
            continue
        password = f"{username}{SIMPLE_PASSWORD_SUFFIX}" if simple else passwords.generate()
        if existing:
            repo.save_security(
                replace(
                    existing,
                    password_hash=hasher.hash(password),
                    must_change_password=True,
                    failed_logins=0,
                    locked_until=None,
                    token_version=existing.token_version + 1,
                    is_active=True,
                )
            )
        else:
            repo.create(
                SellerAccount(
                    Seller(username, s["name"], s.get("zone"), SELLER),
                    hasher.hash(password),
                    must_change_password=True,
                )
            )
        rows.append((username, password, s["name"], s.get("zone") or ""))
    print(f"{'USUARIO':<14}{'CONTRASEÑA':<26}{'NOMBRE':<20}ZONA")
    for username, password, name, zone in rows:
        print(f"{username:<14}{password:<26}{name:<20}{zone}")
    changed = sum(1 for r in rows if not r[1].startswith("("))
    print()
    print(f"OK: {changed} cuentas listas. Al entrar, cada uno debe cambiar su contraseña.")


def seed_history(session: Session, settings: Settings) -> None:
    """Proyecciones BRASA de los últimos 21 días para cada vendedor (para ver los dashboards)."""
    today = ZoneClock(settings.tz).today()
    product_repo, projection_repo = SqlProductRepository(session), SqlProjectionRepository(session)
    brasa = [p for p in product_repo.list_active() if p.category == "BRASA"]
    total = 0
    for seller in [s for s in SqlSellerRepository(session).list_active() if not s.is_supervisor]:
        f = SELLER_FACTOR.get(seller.username, 1.0)
        for back in range(21, 0, -1):
            day = today - timedelta(days=back)
            units = {
                p.id: max(1, round(BASE[day.weekday()][i % 10] * f * random.uniform(0.92, 1.08)))
                for i, p in enumerate(brasa)
            }
            # Reloj fijo en ese día: se guarda como si se hubiera enviado entonces.
            submit = SubmitProjection(product_repo, projection_repo, _DayClock(day), 1)
            submit(seller, "BRASA", [DayUnits(day, units)], None)
            total += 1
    print(f"OK: {total} proyecciones de ejemplo cargadas (últimos 21 días).")


class _DayClock:
    def __init__(self, day: date) -> None:
        self.day = day

    def today(self) -> date:
        return self.day

    def now(self) -> datetime:
        return datetime.combine(self.day, time(8, 30), tzinfo=UTC)


def show(session: Session, limit: int) -> None:
    n, units, kg = session.execute(
        select(
            func.count(),
            func.coalesce(func.sum(projections.c.total_units), 0),
            func.coalesce(func.sum(projections.c.total_kg), 0),
        )
    ).one()
    print(
        f"Vendedores: {session.scalar(select(func.count()).select_from(sellers))} · "
        f"productos: {session.scalar(select(func.count()).select_from(products))}"
    )
    print(f"Proyecciones: {n} · {units} unidades · {kg} kg\n")
    rows = session.execute(
        select(
            projections.c.date,
            sellers.c.username,
            projections.c.category,
            projections.c.total_units,
            projections.c.total_kg,
            projections.c.submitted_at,
        )
        .join(sellers, sellers.c.id == projections.c.seller_id)
        .order_by(projections.c.submitted_at.desc())
        .limit(limit)
    ).all()
    for r in rows:
        print(
            f"{r.date}  {r.username:<10} {r.category:<9} {r.total_units:>6} u  {r.total_kg:>9} kg"
        )


def clear(session: Session) -> None:
    session.execute(delete(projection_lines))
    session.execute(delete(projections))
    session.commit()
    print("OK: Proyecciones borradas.")


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else ""
    settings = get_settings()
    configure_from_settings(settings)
    with SessionLocal() as session:
        if cmd == "init":
            init(session, settings)
        elif cmd == "vendedores":
            create_sellers(session, settings, simple="--simple" in argv, reset="--reset" in argv)
        elif cmd == "seed":
            seed_history(session, settings)
        elif cmd == "supervisor" and len(argv) == 3:
            create_supervisor(session, argv[1].strip().lower(), argv[2].strip())
        elif cmd == "show":
            show(session, int(argv[1]) if len(argv) > 1 else 20)
        elif cmd == "clear" and "--yes" in argv:
            clear(session)
        else:
            print(__doc__)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
