"""Hora de corte y habilitaciones de edición: reglas del dominio y flujo completo por la API."""

from datetime import UTC, date, datetime, time, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.planning.domain.editing import (
    APPROVED,
    REQUESTED,
    CutoffPolicy,
    EditUnlock,
    clean_reason,
    parse_cutoff,
)
from app.planning.infrastructure import cli
from app.planning.infrastructure.clock import ZoneClock
from app.shared.domain.errors import ConflictError, DomainError
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

# --- Dominio ----------------------------------------------------------------------------

DAY = date(2026, 11, 5)


def test_cutoff_closes_the_same_day_by_default() -> None:
    policy = CutoffPolicy(time(7, 0))
    assert policy.closes_at(DAY, UTC) == datetime(2026, 11, 5, 7, 0, tzinfo=UTC)
    assert policy.is_open(DAY, datetime(2026, 11, 5, 6, 59, tzinfo=UTC))
    assert not policy.is_open(DAY, datetime(2026, 11, 5, 7, 0, tzinfo=UTC))


def test_cutoff_can_close_days_before() -> None:
    policy = CutoffPolicy(time(19, 0), days_before=1)
    assert policy.closes_at(DAY, UTC) == datetime(2026, 11, 4, 19, 0, tzinfo=UTC)


def test_window_is_today_tomorrow_and_the_day_after() -> None:
    policy = CutoffPolicy(time(7, 0), open_days=3)
    assert policy.window(DAY) == [DAY, DAY + timedelta(days=1), DAY + timedelta(days=2)]
    assert policy.last_day(DAY) == DAY + timedelta(days=2)


@pytest.mark.parametrize("value", ["7:00", "24:00", "07:60", "siete", ""])
def test_invalid_cutoff_time(value) -> None:
    with pytest.raises(DomainError):
        parse_cutoff(value)


def test_reason_is_required_and_trimmed() -> None:
    assert clean_reason("  se  cayó la red ") == "se cayó la red"
    with pytest.raises(DomainError):
        clean_reason("   ")


def test_unlock_transitions() -> None:
    now = datetime(2026, 11, 5, 8, 0, tzinfo=UTC)
    unlock = EditUnlock("rnavarro", DAY, "motivo", REQUESTED, now)
    approved = unlock.decide("approve", "supervisor", now)
    assert approved.status == APPROVED and approved.is_open and approved.decided_by == "supervisor"
    assert not approved.decide("close", "supervisor", now).is_open
    with pytest.raises(ConflictError):
        approved.decide("approve", "supervisor", now)  # ya aprobada
    with pytest.raises(ConflictError):
        unlock.decide("close", "supervisor", now)  # no se cierra lo que no se abrió


# --- API --------------------------------------------------------------------------------

TODAY = ZoneClock(get_settings().tz).today()


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
    return TestClient(app)


def _login(client, username) -> None:
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"username": username, "password": "demo1234"})
    assert r.status_code == 200, r.text


def _submit(client, offset: int):
    day = (TODAY + timedelta(days=offset)).isoformat()
    return client.post(
        "/api/projections",
        json={"category": "BRASA", "days": [{"date": day, "units": {"P0001": 5}}]},
    )


def test_full_unlock_flow(client) -> None:
    # El supervisor adelanta el corte a las 00:00: hoy queda cerrado, mañana sigue abierto.
    _login(client, "supervisor")
    r = client.put("/api/admin/editing/cutoff", json={"cutoff_time": "00:00", "days_before": 0})
    assert r.status_code == 200, r.text
    assert r.json()["cutoff_time"] == "00:00"

    _login(client, "rnavarro")
    window = client.get("/api/editing").json()
    assert window["policy"]["cutoff_time"] == "00:00"
    assert [d["open"] for d in window["days"]][:2] == [False, True]
    assert _submit(client, 1).status_code == 201
    closed = _submit(client, 0)
    assert closed.status_code == 403 and "habilitación" in closed.json()["detail"]

    # Pide habilitación con motivo; no puede pedir dos veces ni para un día abierto.
    today = TODAY.isoformat()
    r = client.post(
        "/api/editing/unlocks", json={"date": today, "reason": "Llegó un pedido grande"}
    )
    assert r.status_code == 201, r.text
    unlock_id = r.json()["id"]
    assert (
        client.post("/api/editing/unlocks", json={"date": today, "reason": "otra"}).status_code
        == 409
    )
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    assert (
        client.post("/api/editing/unlocks", json={"date": tomorrow, "reason": "x"}).status_code
        == 422
    )
    # El vendedor no puede aprobarse a sí mismo.
    r = client.post(f"/api/admin/editing/unlocks/{unlock_id}", json={"action": "approve"})
    assert r.status_code == 403

    # El supervisor recibe el aviso, ve la solicitud y la aprueba.
    _login(client, "supervisor")
    kinds = [n["kind"] for n in client.get("/api/notifications").json()["items"]]
    assert "edit_requested" in kinds
    pending = client.get("/api/editing/unlocks").json()
    assert [(u["seller"], u["status"]) for u in pending] == [("rnavarro", "requested")]
    r = client.post(f"/api/admin/editing/unlocks/{unlock_id}", json={"action": "approve"})
    assert r.status_code == 200 and r.json()["status"] == "approved"

    # Con la habilitación, el vendedor edita hoy; al cerrarla, ya no.
    _login(client, "rnavarro")
    assert client.get("/api/editing").json()["days"][0]["open"] is True
    assert _submit(client, 0).status_code == 201
    kinds = [n["kind"] for n in client.get("/api/notifications").json()["items"]]
    assert "edit_decided" in kinds

    _login(client, "supervisor")
    r = client.post(f"/api/admin/editing/unlocks/{unlock_id}", json={"action": "close"})
    assert r.status_code == 200 and r.json()["status"] == "closed"
    _login(client, "rnavarro")
    assert _submit(client, 0).status_code == 403


def test_days_beyond_the_window_are_rejected(client) -> None:
    _login(client, "rnavarro")
    last = len(client.get("/api/editing").json()["days"])
    assert _submit(client, last - 1).status_code == 201
    r = _submit(client, last)
    assert r.status_code == 422 and "Solo puedes registrar hasta" in r.json()["detail"]


def test_only_supervisor_changes_the_cutoff(client) -> None:
    _login(client, "rnavarro")
    body = {"cutoff_time": "08:00", "days_before": 0}
    assert client.put("/api/admin/editing/cutoff", json=body).status_code == 403
    _login(client, "supervisor")
    assert (
        client.put("/api/admin/editing/cutoff", json={**body, "cutoff_time": "8am"}).status_code
        == 422
    )
    assert (
        client.put("/api/admin/editing/cutoff", json={**body, "days_before": 9}).status_code == 422
    )
