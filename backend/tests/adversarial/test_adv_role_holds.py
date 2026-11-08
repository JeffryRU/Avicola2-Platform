"""Ataques que el sistema de roles resiste (deben pasar)."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.planning.domain.notifications import SESSION_REVOKED
from app.planning.domain.permissions import GENERAL_SUPERVISOR, SELLER, SUPERVISOR
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.events import event_bus
from tests.adversarial.adv_support import account, count_active, db, login, new_account  # noqa: F401

TODAY = ZoneClock(get_settings().tz).today()


def _token(username: str, password: str = "demo1234") -> str:
    r = TestClient(app).post("/api/auth/token", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --- Supervisor contra supervisores y general ---------------------------------------------


def test_supervisor_cannot_touch_peers_or_general_in_any_way(db):
    gen = login("general")
    new_account(gen, "sup2", SUPERVISOR)
    assert gen.patch("/api/admin/accounts/sup2", json={"active": False}).status_code == 200
    sup = login("supervisor")
    for target in ("sup2", "general"):
        assert sup.post(f"/api/admin/accounts/{target}/reset-password").status_code == 403
        assert sup.patch(f"/api/admin/accounts/{target}", json={"active": True}).status_code == 403
        assert (
            sup.put(f"/api/admin/accounts/{target}/role", json={"role": SELLER}).status_code == 403
        )
    assert account("sup2").is_active is False


@pytest.mark.parametrize(
    "role",
    ["general_supervisor", "supervisor", "GENERAL_SUPERVISOR", " supervisor", "supervisor\u200b"],
)
def test_supervisor_cannot_create_privileged_accounts(db, role):
    r = login("supervisor").post(
        "/api/admin/accounts", json={"username": "evil", "name": "Evil", "role": role}
    )
    assert r.status_code in (403, 422)
    assert account("evil") is None


@pytest.mark.parametrize("path", ["Supervisor", "supervisor%20", "%E2%80%8Bsupervisor", "GENERAL"])
def test_path_tricks_do_not_reach_other_accounts_on_case_sensitive_db(db, path):
    sup = login("supervisor")
    assert sup.post(f"/api/admin/accounts/{path}/reset-password").status_code == 404


def test_extra_fields_are_not_mass_assigned(db):
    sup = login("supervisor")
    r = sup.patch("/api/admin/accounts/rnavarro", json={"active": True, "role": GENERAL_SUPERVISOR})
    assert r.status_code == 200 and r.json()["role"] == SELLER
    seller = login("hdias")
    seller.patch("/api/auth/profile", json={"name": "Hebert", "role": GENERAL_SUPERVISOR})
    assert account("hdias").seller.role == SELLER


# --- Sesiones tras cambio de rol / desactivación -----------------------------------------


def test_old_cookie_and_bearer_die_after_demotion(db):
    cookie = login("supervisor")
    bearer = _token("supervisor")
    assert (
        login("general")
        .put("/api/admin/accounts/supervisor/role", json={"role": SELLER})
        .status_code
        == 200
    )
    assert cookie.get("/api/admin/accounts").status_code == 401
    assert TestClient(app).get("/api/admin/accounts", headers=_bearer(bearer)).status_code == 401


def test_reactivation_does_not_revive_old_tokens(db):
    bearer = _token("supervisor")
    gen = login("general")
    assert gen.patch("/api/admin/accounts/supervisor", json={"active": False}).status_code == 200
    assert gen.patch("/api/admin/accounts/supervisor", json={"active": True}).status_code == 200
    assert TestClient(app).get("/api/auth/me", headers=_bearer(bearer)).status_code == 401


def test_role_change_publishes_session_revoked_for_target(db):
    received = []
    original = event_bus.publish
    event_bus.publish = received.append  # type: ignore[method-assign]
    try:
        r = login("general").put("/api/admin/accounts/supervisor/role", json={"role": SELLER})
    finally:
        event_bus.publish = original  # type: ignore[method-assign]
    assert r.status_code == 200
    assert [(e.type, e.audience.usernames) for e in received] == [
        (SESSION_REVOKED, frozenset({"supervisor"}))
    ]


def test_general_with_temporary_password_cannot_use_admin(db):
    gen = login("general")
    temp = gen.post(
        "/api/admin/accounts",
        json={"username": "gen2", "name": "G2", "role": GENERAL_SUPERVISOR},
    ).json()["temporary_password"]
    g2 = login("gen2", temp)
    assert g2.get("/api/admin/accounts").status_code == 403
    assert g2.put("/api/admin/accounts/rnavarro/role", json={"role": SUPERVISOR}).status_code == 403


def test_sequential_mutual_demotion_is_stopped_by_session_revocation(db):
    g2 = new_account(login("general"), "gen2", GENERAL_SUPERVISOR)
    gen = login("general")
    assert gen.put("/api/admin/accounts/gen2/role", json={"role": SELLER}).status_code == 200
    assert g2.put("/api/admin/accounts/general/role", json={"role": SELLER}).status_code == 401
    assert count_active(GENERAL_SUPERVISOR) == 1


# --- Datos fuera de /api/admin -------------------------------------------------------------


def test_seller_only_sees_own_data_everywhere(db):
    body = {"category": "BRASA", "days": [{"date": TODAY.isoformat(), "units": {"P0001": 5}}]}
    assert login("hdias").post("/api/projections", json=body).status_code == 201
    s = login("rnavarro")
    q = f"date_from={(TODAY - timedelta(days=30)).isoformat()}&date_to={TODAY.isoformat()}"
    assert [x["username"] for x in s.get("/api/sellers").json()] == ["rnavarro"]
    assert all(
        p["seller"] == "rnavarro" for p in s.get(f"/api/projections?{q}&seller=hdias").json()
    )
    assert all(
        c["seller"] == "rnavarro"
        for c in s.get(f"/api/projections/history?{q}&seller=hdias").json()
    )
    assert s.get("/api/admin/accounts").status_code == 403
    assert s.post("/api/projections", json=body | {"seller": "hdias"}).status_code == 403
    assert s.get("/api/editing/unlocks").json() == []


def test_supervisor_cannot_act_on_behalf_of_non_sellers(db):
    sup = login("supervisor")
    body = {"category": "BRASA", "days": [{"date": TODAY.isoformat(), "units": {"P0001": 5}}]}
    assert sup.post("/api/projections", json=body | {"seller": "general"}).status_code == 404
    r = sup.post("/api/admin/editing/sellers/general/grant", json={"dates": [TODAY.isoformat()]})
    assert r.status_code == 404
    assert {x["username"] for x in sup.get("/api/sellers").json()}.isdisjoint(
        {"general", "supervisor"}
    )


def test_notifications_reach_general_too(db):
    body = {"category": "BRASA", "days": [{"date": TODAY.isoformat(), "units": {"P0001": 5}}]}
    assert login("rnavarro").post("/api/projections", json=body).status_code == 201
    titles = [n["title"] for n in login("general").get("/api/notifications").json()["items"]]
    assert "Proyección de Roberto Navarro" in titles
