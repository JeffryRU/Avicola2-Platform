"""Roles y permisos: vendedor, supervisor y supervisor general (domain/permissions.py)."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.planning.domain.permissions import (
    GENERAL_SUPERVISOR,
    ROLES,
    SELLER,
    SUPERVISOR,
    Permission,
    assignable_roles,
    can,
    can_manage,
    manageable_roles,
    roles_with,
)
from app.planning.infrastructure import cli
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
    return TestClient(app)


def _as(username: str) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": username, "password": "demo1234"})
    assert r.status_code == 200, r.text
    return c


def _new(c: TestClient, username: str, role: str) -> str:
    r = c.post("/api/admin/accounts", json={"username": username, "name": username, "role": role})
    assert r.status_code == 201, r.text
    return r.json()["temporary_password"]


# --- Fuente única de permisos -------------------------------------------------------


def test_permission_table():
    assert not any(can(SELLER, p) for p in Permission)
    assert can(SUPERVISOR, Permission.MANAGE_ACCOUNTS)
    assert not can(SUPERVISOR, Permission.CHANGE_ROLES)
    assert all(can(GENERAL_SUPERVISOR, p) for p in Permission)
    assert manageable_roles(SELLER) == ()
    assert manageable_roles(SUPERVISOR) == (SELLER,)
    assert manageable_roles(GENERAL_SUPERVISOR) == ROLES
    assert not can_manage(SUPERVISOR, SUPERVISOR)
    assert not can_manage(SUPERVISOR, GENERAL_SUPERVISOR)
    assert assignable_roles(SUPERVISOR, SELLER) == ()
    assert assignable_roles(GENERAL_SUPERVISOR, SUPERVISOR) == ROLES
    assert roles_with(Permission.VIEW_TEAM) == (SUPERVISOR, GENERAL_SUPERVISOR)


def test_unknown_role_has_no_permissions():
    assert not any(can("admin", p) for p in Permission)
    assert manageable_roles("admin") == ()


def test_session_exposes_resolved_permissions(client):
    me = _as("supervisor").get("/api/auth/me").json()
    assert set(me["permissions"]) == {
        "view_team",
        "manage_editing",
        "manage_accounts",
        "view_stock",
        "view_saca",
        "view_production",
    }
    assert me["manageable_roles"] == ["seller"]
    me = _as("general").get("/api/auth/me").json()
    assert "change_roles" in me["permissions"]
    assert me["manageable_roles"] == list(ROLES)


# --- Supervisor: solo vendedores ----------------------------------------------------


def test_supervisor_cannot_create_supervisors(client):
    sup = _as("supervisor")
    for role in (SUPERVISOR, GENERAL_SUPERVISOR):
        r = sup.post(
            "/api/admin/accounts", json={"username": "x" + role[:5], "name": "X", "role": role}
        )
        assert r.status_code == 403, r.text
    _new(sup, "ltorres", SELLER)


def test_supervisors_cannot_manage_each_other(client):
    gen = _as("general")
    _new(gen, "otrosup", SUPERVISOR)
    sup = _as("supervisor")
    assert sup.post("/api/admin/accounts/otrosup/reset-password").status_code == 403
    assert sup.patch("/api/admin/accounts/otrosup", json={"active": False}).status_code == 403
    assert sup.post("/api/admin/accounts/general/reset-password").status_code == 403
    assert sup.patch("/api/admin/accounts/general", json={"active": False}).status_code == 403
    # A los vendedores, sí.
    assert sup.post("/api/admin/accounts/rnavarro/reset-password").status_code == 200


def test_account_list_tells_what_the_viewer_can_do(client):
    rows = {a["username"]: a for a in _as("supervisor").get("/api/admin/accounts").json()}
    assert rows["rnavarro"]["can_manage"] is True
    assert rows["rnavarro"]["assignable_roles"] == []
    assert rows["general"]["can_manage"] is False
    assert rows["supervisor"]["can_manage"] is False  # la propia cuenta
    rows = {a["username"]: a for a in _as("general").get("/api/admin/accounts").json()}
    assert rows["supervisor"]["can_manage"] is True
    assert rows["supervisor"]["assignable_roles"] == list(ROLES)
    assert rows["general"]["can_manage"] is False and rows["general"]["assignable_roles"] == []


# --- Supervisor general ---------------------------------------------------------------


def test_general_manages_supervisors(client):
    gen = _as("general")
    temporary = _new(gen, "nuevosup", SUPERVISOR)
    assert (
        TestClient(app)
        .post("/api/auth/login", json={"username": "nuevosup", "password": temporary})
        .json()["seller"]["role"]
        == SUPERVISOR
    )
    assert gen.post("/api/admin/accounts/supervisor/reset-password").status_code == 200
    assert gen.patch("/api/admin/accounts/supervisor", json={"active": False}).status_code == 200
    _new(gen, "otrogeneral", GENERAL_SUPERVISOR)


def test_general_changes_roles_and_closes_the_sessions(client):
    seller = _as("rnavarro")
    gen = _as("general")
    r = gen.put("/api/admin/accounts/rnavarro/role", json={"role": SUPERVISOR})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == SUPERVISOR
    assert seller.get("/api/auth/me").status_code == 401  # debe volver a entrar
    me = _as("rnavarro").get("/api/auth/me").json()
    assert me["seller"]["role"] == SUPERVISOR and "view_team" in me["permissions"]
    # Y de vuelta a vendedor.
    r = gen.put("/api/admin/accounts/rnavarro/role", json={"role": SELLER})
    assert r.json()["role"] == SELLER


def test_same_role_is_a_no_op_and_keeps_the_session(client):
    seller = _as("rnavarro")
    r = _as("general").put("/api/admin/accounts/rnavarro/role", json={"role": SELLER})
    assert r.status_code == 200
    assert seller.get("/api/auth/me").status_code == 200


def test_only_general_changes_roles(client):
    body = {"role": SUPERVISOR}
    assert _as("supervisor").put("/api/admin/accounts/rnavarro/role", json=body).status_code == 403
    assert _as("rnavarro").put("/api/admin/accounts/hdias/role", json=body).status_code == 403
    assert TestClient(app).put("/api/admin/accounts/hdias/role", json=body).status_code == 401


def test_general_cannot_change_own_role(client):
    r = _as("general").put("/api/admin/accounts/general/role", json={"role": SELLER})
    assert r.status_code == 422


@pytest.mark.parametrize("role", ["admin", "SUPERVISOR", "", " supervisor"])
def test_invalid_roles_are_rejected(client, role):
    r = _as("general").put("/api/admin/accounts/rnavarro/role", json={"role": role})
    assert r.status_code == 422


def test_unknown_account_role_change(client):
    r = _as("general").put("/api/admin/accounts/nadie/role", json={"role": SELLER})
    assert r.status_code == 404


# --- El supervisor general también supervisa -----------------------------------------


def test_general_sees_the_team_and_manages_editing(client):
    gen = _as("general")
    team = {s["username"] for s in gen.get("/api/sellers").json()}
    assert "rnavarro" in team and "general" not in team and "supervisor" not in team
    assert (
        gen.put(
            "/api/admin/editing/cutoff",
            json={"cutoff_time": "18:00", "days_before": 1, "enabled": True},
        ).status_code
        == 200
    )


def test_editing_admin_is_blocked_at_the_router_for_sellers(client):
    seller = _as("rnavarro")
    assert seller.post("/api/admin/editing/sellers/hdias/revoke").status_code == 403
    assert (
        seller.put(
            "/api/admin/editing/cutoff",
            json={"cutoff_time": "18:00", "days_before": 1, "enabled": True},
        ).status_code
        == 403
    )


# --- Consola --------------------------------------------------------------------------


def test_cli_creates_a_general_supervisor_and_changes_roles(capsys):
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        # Sin supervisor general, no se acepta un supervisor normal (nadie podría gestionarlo).
        assert cli.create_supervisor(session, "jefe", "Jefe") == 1
        assert cli.create_supervisor(session, "jefa", "Jefa", general=True) == 0
        assert "supervisor general jefa creado" in capsys.readouterr().out
        # Es la única: no se la puede degradar.
        assert cli.set_role(session, "jefa", SUPERVISOR) == 1
        assert "último supervisor general" in capsys.readouterr().out
        assert cli.create_supervisor(session, "otra", "Otra", general=True) == 0
        assert cli.set_role(session, "jefa", SUPERVISOR) == 0
        assert cli.set_role(session, "jefa", "admin") == 1
        assert cli.set_role(session, "nadie", SELLER) == 1
