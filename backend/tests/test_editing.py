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


def test_reminder_targets_the_next_day_still_open(client) -> None:
    # Cierre el día anterior: hoy ya cerró, el recordatorio es por mañana (cierra hoy).
    _login(client, "supervisor")
    body = {"cutoff_time": "23:59", "days_before": 1}
    assert client.put("/api/admin/editing/cutoff", json=body).status_code == 200
    assert client.post("/api/internal/notifications/projection-reminders").status_code == 200
    _login(client, "hdias")
    reminder = client.get("/api/notifications").json()["items"][0]
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    assert reminder["link"] == f"/registrar?dia={tomorrow}"
    assert "Cierra hoy a las 23:59" in reminder["body"]


# --- Ventana desde mañana, bloqueo apagado y avisos de quién no registró -----------------


def test_window_can_start_tomorrow() -> None:
    policy = CutoffPolicy(time(19, 0), days_before=1, open_days=7, starts_in=1)
    window = policy.window(DAY)
    assert window[0] == DAY + timedelta(days=1) and len(window) == 7
    assert policy.first_day(DAY) == window[0] and policy.last_day(DAY) == window[-1]


def test_disabled_lock_keeps_every_day_open() -> None:
    policy = CutoffPolicy(time(7, 0), enabled=False)
    assert policy.is_open(DAY, datetime(2026, 11, 6, 12, 0, tzinfo=UTC))
    assert (
        policy.closed_recently(DAY, datetime(2026, 11, 5, 7, 1, tzinfo=UTC), timedelta(hours=6))
        == []
    )


def test_closed_recently_finds_the_day_whose_cutoff_just_passed() -> None:
    policy = CutoffPolicy(time(19, 0), days_before=1, open_days=7, starts_in=1)
    within = timedelta(hours=6)
    tomorrow = DAY + timedelta(days=1)
    assert policy.closed_recently(DAY, datetime(2026, 11, 5, 18, 59, tzinfo=UTC), within) == []
    assert policy.closed_recently(DAY, datetime(2026, 11, 5, 19, 0, tzinfo=UTC), within) == [
        tomorrow
    ]
    # Pasadas las 6 horas ya no se avisa (p. ej., tras reiniciar la API al día siguiente).
    assert policy.closed_recently(DAY, datetime(2026, 11, 6, 1, 1, tzinfo=UTC), within) == []


class FixedClock:
    """Reloj que el test mueve a mano (en la zona del negocio)."""

    def __init__(self) -> None:
        self.tz = ZoneClock(get_settings().tz).tz
        self.at = datetime.combine(TODAY, time(12, 0), tzinfo=self.tz)

    def now(self) -> datetime:
        return self.at

    def today(self) -> date:
        return self.at.date()


@pytest.fixture
def from_tomorrow(client, monkeypatch):
    """Ventana desde mañana con corte a las 19:00 del día anterior y un reloj controlado."""
    clock = FixedClock()
    monkeypatch.setattr(get_settings(), "planning_starts_in_days", 1)
    monkeypatch.setattr("app.planning.bootstrap.ZoneClock", lambda _tz: clock)
    _login(client, "supervisor")
    body = {"cutoff_time": "19:00", "days_before": 1}
    assert client.put("/api/admin/editing/cutoff", json=body).status_code == 200
    return clock


def test_sellers_register_from_tomorrow(client, from_tomorrow) -> None:
    _login(client, "rnavarro")
    window = client.get("/api/editing").json()
    assert window["policy"]["starts_in"] == 1
    assert window["days"][0]["date"] == (TODAY + timedelta(days=1)).isoformat()
    assert len(window["days"]) == 7
    r = _submit(client, 0)
    assert r.status_code == 422 and "se registran desde" in r.json()["detail"]
    assert _submit(client, 1).status_code == 201
    assert _submit(client, 7).status_code == 201
    assert _submit(client, 8).status_code == 422


def test_supervisor_turns_the_lock_off_and_on(client, from_tomorrow) -> None:
    from_tomorrow.at = from_tomorrow.at.replace(hour=20)  # pasó el corte de mañana
    _login(client, "rnavarro")
    assert _submit(client, 1).status_code == 403

    _login(client, "supervisor")
    off = {"cutoff_time": "19:00", "days_before": 1, "enabled": False}
    r = client.put("/api/admin/editing/cutoff", json=off)
    assert r.status_code == 200 and r.json()["enabled"] is False
    _login(client, "rnavarro")
    assert client.get("/api/editing").json()["days"][0]["open"] is True
    assert _submit(client, 1).status_code == 201

    _login(client, "supervisor")
    assert client.put("/api/admin/editing/cutoff", json={**off, "enabled": True}).status_code == 200
    _login(client, "rnavarro")
    assert _submit(client, 1).status_code == 403


def test_supervisor_grants_and_revokes_editing_per_seller(client, from_tomorrow) -> None:
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    in_two = (TODAY + timedelta(days=2)).isoformat()
    # Antes del corte, el vendedor pide... no puede (el día está abierto); el supervisor sí
    # puede habilitarlo por adelantado.
    _login(client, "supervisor")
    r = client.post("/api/admin/editing/sellers/rnavarro/grant", json={"dates": [tomorrow, in_two]})
    assert r.status_code == 200, r.text
    assert [(u["date"], u["status"]) for u in r.json()] == [
        (tomorrow, "approved"),
        (in_two, "approved"),
    ]
    # Repetirlo no duplica.
    again = client.post("/api/admin/editing/sellers/rnavarro/grant", json={"dates": [tomorrow]})
    assert [u["id"] for u in again.json()] == [r.json()[0]["id"]]

    from_tomorrow.at = from_tomorrow.at.replace(hour=20)  # pasó el corte de mañana
    _login(client, "rnavarro")
    kinds = [n["kind"] for n in client.get("/api/notifications").json()["items"]]
    assert "edit_decided" in kinds
    assert client.get("/api/editing").json()["days"][0]["open"] is True
    assert _submit(client, 1).status_code == 201
    # Otro vendedor sigue cerrado.
    _login(client, "hdias")
    assert _submit(client, 1).status_code == 403

    _login(client, "supervisor")
    r = client.post("/api/admin/editing/sellers/rnavarro/revoke")
    assert r.status_code == 200 and {u["status"] for u in r.json()} == {"closed"}
    _login(client, "rnavarro")
    assert _submit(client, 1).status_code == 403


def test_grant_editing_validations(client, from_tomorrow) -> None:
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    _login(client, "rnavarro")
    r = client.post("/api/admin/editing/sellers/hdias/grant", json={"dates": [tomorrow]})
    assert r.status_code == 403
    _login(client, "supervisor")
    today = TODAY.isoformat()
    r = client.post("/api/admin/editing/sellers/rnavarro/grant", json={"dates": [today]})
    assert r.status_code == 422
    r = client.post("/api/admin/editing/sellers/supervisor/grant", json={"dates": [tomorrow]})
    assert r.status_code == 404
    assert client.post("/api/admin/editing/sellers/nadie/revoke").status_code == 404


def test_missed_projection_notifications(client, from_tomorrow) -> None:
    tomorrow = TODAY + timedelta(days=1)
    _login(client, "rnavarro")
    assert _submit(client, 1).status_code == 201

    _login(client, "supervisor")
    run = "/api/internal/notifications/missed-projections"
    assert client.post(run).json()["created"] == 0  # todavía no pasa el corte

    from_tomorrow.at = from_tomorrow.at.replace(hour=19, minute=1)
    created = client.post(run).json()["created"]
    assert created > 0
    assert client.post(run).json()["created"] == 0  # una sola vez por día

    items = client.get("/api/notifications").json()["items"]
    missed = [n for n in items if n["kind"] == "projection_missed"]
    assert len(missed) == 1
    assert f"sin proyección del {tomorrow:%d/%m}" in missed[0]["title"]
    assert "Roberto" not in missed[0]["body"] and "Hebert" in missed[0]["body"]
    assert missed[0]["link"] == f"/dashboards/dia/{tomorrow.isoformat()}"

    _login(client, "hdias")
    items = client.get("/api/notifications").json()["items"]
    assert any(n["kind"] == "projection_missed" for n in items)
    _login(client, "rnavarro")
    items = client.get("/api/notifications").json()["items"]
    assert not any(n["kind"] == "projection_missed" for n in items)


def test_periodic_check_runs_with_its_own_session(client) -> None:
    from app.planning.infrastructure.scheduler import check_missed_projections

    assert check_missed_projections(get_settings()) == 0
