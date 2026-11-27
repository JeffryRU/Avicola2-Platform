"""Ataques al sistema de roles, de una revisión adversarial independiente (ADR 0010).

Los 14 funcionaban contra la primera versión. Cada test afirma el comportamiento SEGURO que
pide la especificación: si alguno vuelve a fallar, el ataque volvió a funcionar."""

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert

from app.core.config import get_settings
from app.main import app
from app.planning.application import accounts as acc
from app.planning.domain.notifications import PROJECTIONS_CHANGED, SESSION_REVOKED
from app.planning.domain.permissions import GENERAL_SUPERVISOR, SELLER, SUPERVISOR
from app.planning.infrastructure import cli
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.events import event_bus
from app.planning.infrastructure.persistence.notifications import SqlNotificationRepository
from app.planning.infrastructure.persistence.tables import sellers
from app.planning.infrastructure.security import RandomTemporaryPasswords, ScryptPasswordHasher
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine
from tests.adversarial.adv_support import (  # noqa: F401
    HookedSellerRepository,
    account,
    count_active,
    db,
    login,
    new_account,
    override_use_cases,
)

TODAY = ZoneClock(get_settings().tz).today()


def _submit(c: TestClient) -> None:
    body = {"category": "BRASA", "days": [{"date": TODAY.isoformat(), "units": {"P0001": 5}}]}
    assert c.post("/api/projections", json=body).status_code == 201


def _concurrently(fn):
    """Ejecuta `fn(use_cases)` en otra sesión de base, como otra petición que se confirma ya."""
    from app.planning.bootstrap import build_use_cases

    with SessionLocal() as s:
        fn(build_use_cases(s, get_settings()))


# --- 1. Defensa en profundidad: el endpoint de rol solo tiene MANAGE_ACCOUNTS en el router ----


def test_role_endpoint_blocks_supervisors_at_router_level_even_if_use_case_regresses(db):
    """Si el caso de uso dejara de comprobar CHANGE_ROLES (regresión), el router debería
    seguir cortando al supervisor (el endpoint exige CHANGE_ROLES también en el router)."""
    reached = []

    def permissive_change_role(actor, username, role):
        reached.append(actor.seller.username)
        return account(username)

    override_use_cases(lambda _s, _uc: {"change_role": permissive_change_role})
    r = login("supervisor").put("/api/admin/accounts/rnavarro/role", json={"role": SUPERVISOR})
    assert reached == [], "el supervisor llegó al caso de uso de cambio de rol"
    assert r.status_code == 403


# --- 2. Cero supervisores generales: dos generales se degradan a la vez ----------------------


def test_concurrent_mutual_demotion_cannot_leave_zero_general_supervisors(db):
    general2 = new_account(login("general"), "general2", GENERAL_SUPERVISOR)
    real = {}

    def racing(actor, username, role):
        if actor.seller.username == "general2":
            # Mientras la petición de general2 ya pasó la autenticación, general lo degrada.
            _concurrently(lambda uc: uc.change_role(account("general"), "general2", SUPERVISOR))
        return real["fn"](actor, username, role)

    def patch(_s, uc):
        real["fn"] = uc.change_role
        return {"change_role": racing}

    override_use_cases(patch)
    r = general2.put("/api/admin/accounts/general/role", json={"role": SELLER})
    assert count_active(GENERAL_SUPERVISOR) >= 1, (
        f"quedan 0 supervisores generales activos (respuesta {r.status_code})"
    )


def test_concurrent_mutual_deactivation_cannot_leave_zero_general_supervisors(db):
    general2 = new_account(login("general"), "general2", GENERAL_SUPERVISOR)
    real = {}

    def racing(actor, username, active):
        if actor.seller.username == "general2":
            _concurrently(lambda uc: uc.set_account_active(account("general"), "general2", False))
        return real["fn"](actor, username, active)

    def patch(_s, uc):
        real["fn"] = uc.set_account_active
        return {"set_account_active": racing}

    override_use_cases(patch)
    general2.patch("/api/admin/accounts/general", json={"active": False})
    assert count_active(GENERAL_SUPERVISOR) >= 1


# --- 3. TOCTOU: el supervisor restablece a un vendedor que acaban de ascender ------------------


def test_supervisor_reset_racing_a_promotion_cannot_take_over_a_supervisor(db):
    """El supervisor pide restablecer a hdias (vendedor). Entre la lectura y la escritura, el
    general lo asciende a supervisor. La escritura debe volver a comprobar el rol; si no, el
    supervisor recibiría la contraseña temporal de OTRO supervisor."""

    def promote():
        _concurrently(lambda uc: uc.change_role(account("general"), "hdias", SUPERVISOR))

    def patch(session, _uc):
        repo = HookedSellerRepository(session, "hdias", promote)
        return {
            "reset_password": acc.ResetPassword(
                repo, ScryptPasswordHasher(), RandomTemporaryPasswords(), event_bus
            )
        }

    override_use_cases(patch)
    r = login("supervisor").post("/api/admin/accounts/hdias/reset-password")
    if r.status_code == 200:
        temp = r.json()["temporary_password"]
        taken = TestClient(app).post(
            "/api/auth/login", json={"username": "hdias", "password": temp}
        )
        assert taken.status_code != 200 or taken.json()["seller"]["role"] != SUPERVISOR, (
            "un supervisor obtuvo la contraseña de otro supervisor"
        )
    assert r.status_code in (403, 409)


# --- 4. Lost update: el cambio de rol resucita una cuenta recién desactivada -----------------


def test_role_change_does_not_reactivate_an_account_deactivated_meanwhile(db):
    """El general asciende a hdias; en paralelo, el supervisor lo desactiva (lo despidieron).
    Si el cambio de rol reescribiera las columnas desde una foto vieja, la reactivaría."""

    def deactivate():
        _concurrently(lambda uc: uc.set_account_active(account("supervisor"), "hdias", False))

    def patch(session, _uc):
        repo = HookedSellerRepository(session, "hdias", deactivate)
        return {"change_role": acc.ChangeRole(repo, event_bus, SqlNotificationRepository(session))}

    override_use_cases(patch)
    login("general").put("/api/admin/accounts/hdias/role", json={"role": SUPERVISOR})
    after = account("hdias")
    assert after.is_active is False, (
        f"hdias quedó activo y con rol {after.seller.role}: la desactivación se perdió"
    )


def test_role_change_does_not_undo_a_password_reset_done_meanwhile(db):
    """Igual, con un restablecimiento: el hash viejo no debe volver (la contraseña
    restablecida, p. ej., porque se filtró, no debe seguir funcionando)."""

    def reset():
        _concurrently(lambda uc: uc.reset_password(account("supervisor"), "hdias"))

    def patch(session, _uc):
        repo = HookedSellerRepository(session, "hdias", reset)
        return {"change_role": acc.ChangeRole(repo, event_bus, SqlNotificationRepository(session))}

    override_use_cases(patch)
    login("general").put("/api/admin/accounts/hdias/role", json={"role": SUPERVISOR})
    old_password_still_works = (
        TestClient(app)
        .post("/api/auth/login", json={"username": "hdias", "password": "demo1234"})
        .status_code
        == 200
    )
    assert not old_password_still_works, "el restablecimiento concurrente se perdió"


# --- 5. Un supervisor degradado a vendedor sigue viendo datos del equipo ---------------------


def test_demoted_supervisor_no_longer_sees_team_notifications(db):
    _submit(login("rnavarro"))
    assert any(
        "Roberto Navarro" in n["title"]
        for n in login("supervisor").get("/api/notifications").json()["items"]
    )
    r = login("general").put("/api/admin/accounts/supervisor/role", json={"role": SELLER})
    assert r.status_code == 200
    items = login("supervisor").get("/api/notifications").json()["items"]
    leaked = [n["title"] for n in items if "Roberto Navarro" in n["title"] + n["body"]]
    assert leaked == [], f"el ahora vendedor ve datos de otro vendedor: {leaked}"


# --- 6. Auto-gestión con intercalación insensible a mayúsculas (SQL Server / MySQL) ---------


@pytest.fixture
def ci_db():
    """Simula la intercalación por defecto de Azure SQL/SQL Server (CI_AS) y MySQL (_ci),
    motores soportados por engine.py: username = 'GENERAL' encuentra a 'general'."""
    app.dependency_overrides.clear()
    col = sellers.c.username
    original = col.type.collation
    col.type.collation = "NOCASE"
    try:
        metadata.drop_all(engine)
        metadata.create_all(engine)
    finally:
        col.type.collation = original
    with SessionLocal() as session:
        cli.init(session, get_settings())
    yield
    metadata.drop_all(engine)
    metadata.create_all(engine)


def test_general_cannot_demote_itself_with_uppercase_path_on_ci_collation(ci_db):
    gen = login("general")
    assert gen.put("/api/admin/accounts/general/role", json={"role": SELLER}).status_code == 422
    r = gen.put("/api/admin/accounts/GENERAL/role", json={"role": SELLER})
    assert r.status_code == 422, (
        f"auto-degradación vía 'GENERAL' -> {r.status_code}; "
        f"generales activos: {count_active(GENERAL_SUPERVISOR)}"
    )


def test_general_cannot_deactivate_itself_with_uppercase_path_on_ci_collation(ci_db):
    r = login("general").patch("/api/admin/accounts/General", json={"active": False})
    assert r.status_code == 422, f"{r.status_code}: {r.text}"


def test_revocation_event_targets_the_real_username_on_ci_collation(ci_db):
    """Aun cuando la acción es legítima (general restablece a 'RNAVARRO'), el aviso de sesión
    cerrada se publica para 'RNAVARRO' y el SSE de 'rnavarro' no lo recibe."""
    received = []
    original = event_bus.publish
    event_bus.publish = received.append  # type: ignore[method-assign]
    try:
        r = login("general").post("/api/admin/accounts/RNAVARRO/reset-password")
    finally:
        event_bus.publish = original  # type: ignore[method-assign]
    assert r.status_code == 200
    revoked = [e for e in received if e.type == SESSION_REVOKED]
    assert revoked and "rnavarro" in revoked[0].audience.usernames, [
        e.audience.usernames for e in revoked
    ]


# --- 7. SSE: el rol se fija al conectar; el CLI `rol` no cierra los flujos abiertos ----------


def test_cli_role_change_closes_open_event_stream(db):
    """`cli rol supervisor seller` corre en otro proceso y no puede publicar en este bus en
    memoria. El SSE abierto no debe seguir recibiendo los eventos del equipo: los destinatarios
    se resuelven al publicar, con los roles de la base."""

    async def scenario():
        async with event_bus.subscribe("supervisor", SUPERVISOR) as sub:
            with SessionLocal() as s:
                assert cli.set_role(s, "supervisor", SELLER) == 0
            await asyncio.to_thread(_submit, login("rnavarro"))
            got = []
            try:
                while True:
                    got.append(await asyncio.wait_for(sub.next(), 1))
            except TimeoutError:
                pass
            return [e.type for e in got]

    types = asyncio.run(scenario())
    assert SESSION_REVOKED in types or PROJECTIONS_CHANGED not in types, types


# --- 8. Rol desconocido en la base: el general no puede gestionarla y la API da 500 ---------


def test_unknown_role_in_db_is_a_clean_403_not_a_500(db):
    with SessionLocal() as s:
        s.execute(
            insert(sellers).values(
                username="legacy",
                name="Legacy",
                role="admin",
                password_hash=ScryptPasswordHasher().hash("x"),
            )
        )
        s.commit()
    gen = TestClient(app, raise_server_exceptions=False)
    gen.post("/api/auth/login", json={"username": "general", "password": "demo1234"})
    r = gen.post("/api/admin/accounts/legacy/reset-password")
    assert r.status_code in (403, 422), r.status_code


# --- 9. Consola: nada impide quedarse sin supervisor general ------------------------------


def test_cli_refuses_to_demote_the_last_general_supervisor(db):
    with SessionLocal() as s:
        code = cli.set_role(s, "general", SELLER)
    assert count_active(GENERAL_SUPERVISOR) >= 1, (
        f"cli rol devolvió {code} y no queda ningún general"
    )


def test_cli_first_supervisor_without_general_flag_leaves_no_general(capsys):
    """En producción (sin init de prueba) el primero debe ser general: el CLI no debe aceptar
    un supervisor normal en una base sin supervisor general."""
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as s:
        cli.create_supervisor(s, "jefa", "Jefa")
    assert count_active(GENERAL_SUPERVISOR) >= 1 or count_active(SUPERVISOR) == 0, (
        "primer supervisor creado sin --general: nadie puede gestionar supervisores ni roles"
    )
