"""Comandos de consola de la planificación (equivalen a los `npm run db:*` del mockup).

    uv run python -m app.planning.infrastructure.cli init         productos (+ usuarios de prueba)
    uv run python -m app.planning.infrastructure.cli supervisor <usuario> "<nombre>" [--general]
                        supervisor con contraseña inicial (--general: supervisor general,
                        el único que gestiona a otros supervisores; el primero debe serlo)
    uv run python -m app.planning.infrastructure.cli rol <usuario> <rol>
                        cambia el rol de una cuenta y cierra sus sesiones (p. ej., para
                        ascender a supervisor general a un supervisor que ya existe).
                        Roles: seller, dispatch_chief, supervisor, general_supervisor
    uv run python -m app.planning.infrastructure.cli vendedores [--simple] [--reset]
                        vendedores de la tabla maestra con contraseña inicial
                        (--simple: <usuario>2026; --reset: también a los que ya existen)
    uv run python -m app.planning.infrastructure.cli produccion <archivo.xlsx>
                        carga la historia de producción (hoja DB_CALIDA_B: pedido, producción y
                        calidad B por rango); reemplaza los días que ya estuvieran cargados
    uv run python -m app.planning.infrastructure.cli historia [carpeta]
                        carga todos los datos reales que encuentre en la carpeta (por defecto
                        data/inbox, que no se versiona): DESPACHO*.csv (pedidos de ARIS),
                        VENTAS*.csv (ventas en tienda) y el Excel con la hoja DB_CALIDA_B
                        (producción). Antes ejecuta `init`. Reemplaza lo ya cargado
    uv run python -m app.planning.infrastructure.cli tiendas <archivo.xlsx>
                        pedidos de brasa de las tiendas («Proyección tiendas»: zona, fecha,
                        CANTIDAD 2 y RANGO) para la saca de esos días; reemplaza los de esas fechas
    uv run python -m app.planning.infrastructure.cli entrenar
                        entrena los modelos de demanda (ADR 0020) con la historia de ARIS y guarda
                        métricas y predicciones; el programador lo hace solo de madrugada
    uv run python -m app.planning.infrastructure.cli archivos
                        qué archivos acepta la app, sus columnas y qué módulos usan cada uno
                        (config/imports.yaml)
    uv run python -m app.planning.infrastructure.cli seed         3 semanas de ejemplo
    uv run python -m app.planning.infrastructure.cli show [n]     resumen y últimas n
    uv run python -m app.planning.infrastructure.cli clear --yes  borra las proyecciones

Las tablas las crea Alembic (`uv run alembic upgrade head`).
"""

import random
import sys
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Any

import yaml
from openpyxl import load_workbook
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.orm import Session

from app.core.config import REPO_ROOT, Settings, get_settings
from app.planning.application.use_cases import DayUnits, SubmitProjection
from app.planning.bootstrap import planning_cache
from app.planning.domain.accounts import AccountChange, ChangeOutcome, check_username
from app.planning.domain.models import (
    BRASA_CATEGORY,
    QUALITY_A,
    SELLER,
    Seller,
    SellerAccount,
)
from app.planning.domain.permissions import (
    GENERAL_SUPERVISOR,
    GUARDIAN_ROLE,
    ROLE_LABELS,
    ROLES,
    SUPERVISOR,
)
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.demand_model.training import train as train_model
from app.planning.infrastructure.file_specs import file_specs
from app.planning.infrastructure.history_import import load_dispatch_orders, load_store_sales
from app.planning.infrastructure.persistence.notifications import SqlNotificationRepository
from app.planning.infrastructure.persistence.production import SqlProductionRepository
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
from app.planning.infrastructure.production_import import SHEET, read_production
from app.planning.infrastructure.security import RandomTemporaryPasswords, ScryptPasswordHasher
from app.planning.infrastructure.store_orders_import import load_store_orders
from app.shared.domain.errors import DomainError
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


def load_seed(settings: Settings) -> dict[str, Any]:
    """Datos maestros de config/planning_seed.yaml (productos y usuarios). Único lector."""
    with (settings.config_dir / "planning_seed.yaml").open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def init(session: Session, settings: Settings) -> None:
    """Carga o actualiza productos y vendedores desde config/planning_seed.yaml (idempotente)."""
    seed = load_seed(settings)
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
                "quality": item.get("quality", QUALITY_A),
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
        print(
            '  python -m app.planning.infrastructure.cli supervisor <usuario> "<nombre>" --general'
        )
        return
    password = settings.planning_demo_password
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


def create_supervisor(session: Session, username: str, name: str, general: bool = False) -> int:
    """Primer supervisor (general): luego él crea las demás cuentas desde la app."""
    check_username(username)
    role = GENERAL_SUPERVISOR if general else SUPERVISOR
    repo = SqlSellerRepository(session)
    if repo.get_account(username, active_only=False):
        print(f"El usuario {username} ya existe.")
        return 1
    if not general and not any(a.seller.role == GUARDIAN_ROLE for a in _active_accounts(repo)):
        # Sin supervisor general nadie podría gestionar supervisores ni cambiar roles.
        print(
            f"Todavía no hay un {ROLE_LABELS[GUARDIAN_ROLE]} activo: "
            "crea primero uno con --general."
        )
        return 1
    temporary = RandomTemporaryPasswords().generate()
    repo.create(
        SellerAccount(
            Seller(username, name, None, role),
            ScryptPasswordHasher().hash(temporary),
        )
    )
    print(f"OK: {ROLE_LABELS[role]} {username} creado. Contraseña inicial:")
    print(f"  {temporary}")
    return 0


def _active_accounts(repo: SqlSellerRepository) -> list[SellerAccount]:
    return [a for a in repo.list_accounts() if a.is_active]


def set_role(session: Session, username: str, role: str) -> int:
    """Cambia el rol desde la consola (sin actor: para quien administra el servidor)."""
    if role not in ROLES:
        print(f"Rol inválido: {role}. Usa uno de: {', '.join(ROLES)}.")
        return 1
    repo = SqlSellerRepository(session)
    account = repo.get_account(username, active_only=False)
    if account is None:
        print(f"El usuario {username} no existe.")
        return 1
    if account.seller.role == role:
        print(f"{username} ya es {ROLE_LABELS[role]}.")
        return 0
    # Mismo cambio atómico que la app (sin actor): respeta que quede un supervisor general.
    outcome = repo.apply(
        AccountChange(
            target=account.seller.username,
            target_roles=frozenset({account.seller.role}),
            role=role,
            revoke_sessions=True,
        )
    )
    if outcome is ChangeOutcome.LAST_GUARDIAN:
        print(f"No: {username} es el último {ROLE_LABELS[GUARDIAN_ROLE]} activo.")
        return 1
    if outcome is not ChangeOutcome.APPLIED:
        print(f"No se pudo: la cuenta {username} cambió mientras tanto. Vuelve a intentarlo.")
        return 1
    # Sus avisos eran de su rol anterior. Las sesiones abiertas se cierran por la versión.
    SqlNotificationRepository(session).delete_for(account.seller.username)
    print(f"OK: {username} ahora es {ROLE_LABELS[role]}. Sus sesiones abiertas se cerraron.")
    return 0


# Temporal y obligada a cambiarse al entrar (la política rechaza contraseñas con el usuario).
SIMPLE_PASSWORD_SUFFIX = "2026"  # noqa: S105


def create_sellers(
    session: Session, settings: Settings, *, simple: bool = False, reset: bool = False
) -> None:
    """Vendedores de config/planning_seed.yaml (U0001..U0007), con contraseña inicial.

    Sirve en producción: imprime usuario y contraseña de cada uno, y al entrar se les pide
    cambiarla. `simple` usa <usuario>2026 (fácil de dictar en una entrevista); `reset` también
    restablece a los que ya existen y cierra sus sesiones abiertas.
    """
    seed = load_seed(settings)
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
            repo.apply(
                AccountChange(
                    target=existing.seller.username,
                    target_roles=frozenset({SELLER}),
                    password_hash=hasher.hash(password),
                    active=True,
                    revoke_sessions=True,
                )
            )
        else:
            repo.create(
                SellerAccount(
                    Seller(username, s["name"], s.get("zone"), SELLER),
                    hasher.hash(password),
                )
            )
        rows.append((username, password, s["name"], s.get("zone") or ""))
    print(f"{'USUARIO':<14}{'CONTRASEÑA':<26}{'NOMBRE':<20}ZONA")
    for username, password, name, zone in rows:
        print(f"{username:<14}{password:<26}{name:<20}{zone}")
    changed = sum(1 for r in rows if not r[1].startswith("("))
    print()
    print(f"OK: {changed} cuentas listas. Cada uno puede cambiar su contraseña desde el perfil.")


def seed_history(session: Session, settings: Settings) -> None:
    """Proyecciones BRASA de los últimos 21 días para cada vendedor (para ver los dashboards)."""
    today = ZoneClock(settings.tz).today()
    product_repo, projection_repo = SqlProductRepository(session), SqlProjectionRepository(session)
    brasa = [p for p in product_repo.list_active() if p.category == BRASA_CATEGORY]
    total = 0
    for seller in [s for s in SqlSellerRepository(session).list_active() if s.is_seller]:
        f = SELLER_FACTOR.get(seller.username, 1.0)
        for back in range(21, 0, -1):
            day = today - timedelta(days=back)
            units = {
                p.id: max(1, round(BASE[day.weekday()][i % 10] * f * random.uniform(0.92, 1.08)))
                for i, p in enumerate(brasa)
            }
            # Reloj fijo en ese día: se guarda como si se hubiera enviado entonces.
            submit = SubmitProjection(product_repo, projection_repo, _DayClock(day), 1)
            submit(seller, BRASA_CATEGORY, [DayUnits(day, units)], None)
            total += 1
    print(f"OK: {total} proyecciones de ejemplo cargadas (últimos 21 días).")


class _DayClock:
    def __init__(self, day: date) -> None:
        self.day = day

    def today(self) -> date:
        return self.day

    def now(self) -> datetime:
        return datetime.combine(self.day, time(8, 30), tzinfo=UTC)


def train_demand_model(session: Session) -> int:
    """Entrena los modelos de demanda con la historia de ARIS y guarda métricas y predicciones."""
    summary = train_model(session, SqlProductRepository(session).list_active())
    if summary is None:
        print("No hay historia suficiente de ARIS (cli historia) para entrenar.")
        return 1
    print(
        f"OK: modelo entrenado con {len(summary['sellers'])} vendedores "
        f"({summary['data_from']} a {summary['data_to']})."
    )
    for m in summary["models"]:
        x = m["metrics"]
        print(
            f"  {m['name']:<40} vendedor×día {x['vendedor_dia']:5.1f}% · tamaño×día "
            f"{x['tamano_dia']:5.1f}% · equipo×día {x['equipo_dia']:5.1f}% · "
            f"semana {x['equipo_semana']:5.1f}%"
        )
    return 0


def import_store_orders(session: Session, path: Path) -> int:
    """Pedidos de tiendas (Proyección tiendas.xlsx) para el cálculo de saca de esos días."""
    if not path.is_file():
        print(f"No existe el archivo {path}.")
        return 1
    loaded, skipped = load_store_orders(session, path, SqlProductRepository(session).list_active())
    session.commit()
    print(f"OK: {loaded} pedidos de brasa de tiendas ({path.name}); {skipped} filas descartadas.")
    return 0


def import_production(session: Session, settings: Settings, path: Path) -> int:
    if not path.is_file():
        print(f"No existe el archivo {path}.")
        return 1
    products = SqlProductRepository(session).list_active()
    brasa = [p for p in products if p.category == BRASA_CATEGORY]
    days, skipped = read_production(path, brasa, ZoneClock(settings.tz).now())
    repo = SqlProductionRepository(session)
    for day in days:
        repo.write(day)
    session.commit()
    if not days:
        print("No se encontró ningún día con datos.")
        return 1
    print(
        f"OK: {len(days)} días de producción cargados ({days[0].date} a {days[-1].date}); "
        f"{skipped} filas descartadas."
    )
    return 0


def _find(folder: Path, prefix: str, suffix: str) -> Path | None:
    """El archivo más reciente de la carpeta con ese prefijo y extensión (sin mirar mayúsculas)."""
    matches = [
        f
        for f in folder.iterdir()
        if f.is_file()
        and f.name.lower().startswith(prefix.lower())
        and f.suffix.lower() == suffix
        and not f.name.startswith("~$")
    ]
    return max(matches, key=lambda f: f.stat().st_mtime, default=None)


def _production_workbook(folder: Path) -> Path | None:
    for path in sorted(folder.glob("*.xlsx"), key=lambda f: f.stat().st_mtime, reverse=True):
        if path.name.startswith("~$"):
            continue
        workbook = load_workbook(path, read_only=True)
        found = SHEET in workbook.sheetnames
        workbook.close()
        if found:
            return path
    return None


def load_history(session: Session, settings: Settings, folder: Path) -> int:
    """Llena la base con los datos reales de la carpeta: catálogo, pedidos, ventas y producción."""
    if not folder.is_dir():
        print(f"No existe la carpeta {folder}.")
        return 1
    init(session, settings)
    found = 0
    loaders = (
        ("DESPACHO", "pedidos de despacho", load_dispatch_orders),
        ("VENTAS", "ventas en tienda", load_store_sales),
    )
    for prefix, label, load in loaders:
        path = _find(folder, prefix, ".csv")
        if path is None:
            print(f"--: no hay {prefix}*.csv; {label} sin cambios.")
            continue
        loaded, skipped = load(session, path)
        session.commit()
        found += 1
        print(f"OK: {loaded} líneas de {label} ({path.name}); {skipped} filas descartadas.")
    workbook = _production_workbook(folder)
    if workbook is None:
        print(f"--: no hay un Excel con la hoja {SHEET}; producción sin cambios.")
    else:
        found += 1
        if import_production(session, settings, workbook):
            return 1
    if not found:
        print(f"No se encontró ningún archivo para cargar en {folder}.")
        return 1
    return 0


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


TYPE_LABELS = {"string": "texto", "int": "entero", "float": "número", "date": "fecha"}


def show_files() -> None:
    """Catálogo de datos: cada archivo, para qué se usa y sus columnas (de imports.yaml)."""
    for spec in file_specs().values():
        where = f" · hoja {spec.sheet}" if spec.sheet else ""
        print()
        print(f"{spec.label} [{spec.key}]{where}")
        if spec.description:
            print(f"  {spec.description}")
        for use in spec.used_by:
            print(f"  · {use}")
        for name, col in spec.columns.items():
            flags = [TYPE_LABELS[col.type], "obligatoria" if col.required else "opcional"]
            if col.aliases:
                flags.append("alias: " + ", ".join(col.aliases))
            print(f"    {col.source:<34} → {name:<18} ({'; '.join(flags)})")


def main(argv: list[str]) -> int:
    settings = get_settings()
    configure_from_settings(settings)
    try:
        return _run(argv, settings)
    except DomainError as exc:
        # Un archivo al que le falta una columna, por ejemplo: se explica y no se carga nada.
        print(f"No se cargó: {exc}")
        return 1
    finally:
        # La CLI escribe productos, cuentas y configuración por fuera de los repositorios con
        # caché. Con Redis, esto la limpia también para la API; en memoria, la API lo verá al
        # vencer el TTL (es otro proceso).
        planning_cache.invalidate()


def _run(argv: list[str], settings: Settings) -> int:  # noqa: PLR0911, PLR0912 (un caso por comando)
    cmd = argv[0] if argv else ""
    with SessionLocal() as session:
        if cmd == "init":
            init(session, settings)
        elif cmd == "vendedores":
            create_sellers(session, settings, simple="--simple" in argv, reset="--reset" in argv)
        elif cmd == "seed":
            seed_history(session, settings)
        elif cmd == "supervisor" and len(args := [a for a in argv if a != "--general"]) == 3:
            return create_supervisor(
                session, args[1].strip().lower(), args[2].strip(), general="--general" in argv
            )
        elif cmd == "rol" and len(argv) == 3:
            return set_role(session, argv[1].strip().lower(), argv[2].strip())
        elif cmd == "entrenar":
            return train_demand_model(session)
        elif cmd == "tiendas" and len(argv) == 2:
            return import_store_orders(session, Path(argv[1]))
        elif cmd == "produccion" and len(argv) == 2:
            return import_production(session, settings, Path(argv[1]))
        elif cmd == "historia" and len(argv) <= 2:
            folder = Path(argv[1]) if len(argv) == 2 else REPO_ROOT / "data" / "inbox"
            return load_history(session, settings, folder)
        elif cmd == "archivos":
            show_files()
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
