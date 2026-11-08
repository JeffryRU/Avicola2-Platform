"""Notificaciones reales: al supervisor al enviar, recordatorios y avisos de n8n, y tiempo real."""

import asyncio
import threading
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.planning.domain.notifications import (
    NOTIFICATION_CREATED,
    PROJECTIONS_CHANGED,
    SESSION_REVOKED,
    Audience,
    Event,
)
from app.planning.infrastructure import cli
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.events import InMemoryEventBus, event_bus
from app.planning.infrastructure.http import events as events_http
from app.planning.infrastructure.http.events import _stream
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

TODAY = ZoneClock(get_settings().tz).today()


@pytest.fixture
def client():
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


def _submit(c: TestClient, offset: int = 0) -> None:
    day = (TODAY + timedelta(days=offset)).isoformat()
    body = {"category": "BRASA", "days": [{"date": day, "units": {"P0001": 5}}]}
    assert c.post("/api/projections", json=body).status_code == 201


def test_supervisor_is_notified_when_a_seller_submits(client):
    _submit(_as("rnavarro"))
    supervisor = _as("supervisor")
    page = supervisor.get("/api/notifications").json()
    assert page["unread"] == 1
    n = page["items"][0]
    assert n["kind"] == "projection_submitted" and n["title"] == "Proyección de Roberto Navarro"
    assert "1 día de BRASA (5 unid.)" in n["body"] and n["link"] == "/dashboards/estado"
    # El vendedor no recibe su propia notificación.
    assert _as("rnavarro").get("/api/notifications").json() == {"items": [], "unread": 0}


def test_mark_read_one_or_all(client):
    seller = _as("rnavarro")
    _submit(seller, 0)
    _submit(seller, 1)
    supervisor = _as("supervisor")
    items = supervisor.get("/api/notifications").json()["items"]
    first = items[0]["id"]
    assert supervisor.post("/api/notifications/read", json={"ids": [first]}).json() == {
        "updated": 1
    }
    assert supervisor.get("/api/notifications").json()["unread"] == 1
    assert supervisor.post("/api/notifications/read", json={}).json() == {"updated": 1}
    assert supervisor.get("/api/notifications").json()["unread"] == 0


def test_cannot_mark_someone_elses_notifications(client):
    _submit(_as("rnavarro"))
    supervisor = _as("supervisor")
    ids = [n["id"] for n in supervisor.get("/api/notifications").json()["items"]]
    assert _as("hdias").post("/api/notifications/read", json={"ids": ids}).json() == {"updated": 0}
    assert supervisor.get("/api/notifications").json()["unread"] == 1


def test_daily_reminder_only_for_pending_sellers_and_once(client):
    _submit(_as("rnavarro"))
    r = client.post("/api/internal/notifications/projection-reminders")
    assert r.json() == {"created": 6}  # rnavarro ya envió y el supervisor no proyecta
    assert client.post("/api/internal/notifications/projection-reminders").json() == {"created": 0}
    reminder = _as("hdias").get("/api/notifications").json()["items"][0]
    assert reminder["title"] == "Proyección pendiente"
    assert reminder["link"].startswith("/registrar?dia=")
    assert _as("rnavarro").get("/api/notifications").json()["unread"] == 0


def test_announcements_from_n8n(client):
    body = {"audience": "sellers", "title": "Ventas actualizadas", "body": "Ya llegó el ERP."}
    assert client.post("/api/internal/notifications", json=body).json() == {"created": 7}
    assert _as("supervisor").get("/api/notifications").json()["unread"] == 0
    one = {"audience": "mcordova", "title": "Hola", "body": "Solo para ti."}
    assert client.post("/api/internal/notifications", json=one).json() == {"created": 1}
    missing = {"audience": "nadie", "title": "x", "body": "y"}
    assert client.post("/api/internal/notifications", json=missing).status_code == 404


def test_internal_endpoints_require_the_service_token(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "ingest_api_token", "token-n8n")
    url = "/api/internal/notifications/projection-reminders"
    assert client.post(url).status_code == 401
    assert client.post(url, headers={"X-Api-Token": "otro"}).status_code == 401
    assert client.post(url, headers={"X-Api-Token": "token-n8n"}).status_code == 200


def test_events_require_a_session(client):
    assert client.get("/api/events").status_code == 401


# --- Bus de eventos y flujo SSE -------------------------------------------------------


def test_bus_delivers_only_to_the_audience_from_any_thread():
    bus = InMemoryEventBus()

    async def scenario():
        async with (
            bus.subscribe("rnavarro", "seller") as seller,
            bus.subscribe("ana", "supervisor") as supervisor,
        ):
            # Publicar desde otro hilo, como hacen los endpoints síncronos.
            event = Event(PROJECTIONS_CHANGED, Audience.role("supervisor"), {"x": 1})
            threading.Thread(target=bus.publish, args=(event,)).start()
            got = await asyncio.wait_for(supervisor.next(), 2)
            assert got.data == {"x": 1}
            assert seller.queue.empty()
        assert bus.connections() == 0

    asyncio.run(scenario())


class _FakeRequest:
    def __init__(self, alive_checks: int) -> None:
        self.left = alive_checks

    async def is_disconnected(self) -> bool:
        self.left -= 1
        return self.left < 0


def test_stream_sends_events_and_stops_on_session_revoked():
    bus = InMemoryEventBus()

    async def scenario():
        async with bus.subscribe("rnavarro", "seller") as sub:
            bus.publish(Event(NOTIFICATION_CREATED, Audience.users("rnavarro"), {"id": 7}))
            bus.publish(Event(SESSION_REVOKED, Audience.users("rnavarro"), {"reason": "x"}))
            return [chunk async for chunk in _stream(_FakeRequest(10), sub, None)]

    chunks = asyncio.run(scenario())
    assert chunks[0].startswith("retry: 5000")
    assert chunks[1] == 'event: notification\ndata: {"id": 7}\n\n'
    assert chunks[2].startswith("event: session.revoked")
    assert len(chunks) == 3  # tras cerrar la sesión no sigue enviando


def test_stream_closes_when_the_session_stops_being_valid(monkeypatch):
    """Un cambio hecho en otro proceso (p. ej., `cli rol`) no pasa por este bus: el
    heartbeat revalida la sesión y cierra el canal."""
    monkeypatch.setattr(events_http, "HEARTBEAT_SECONDS", 0.01)
    bus = InMemoryEventBus()

    async def scenario():
        async with bus.subscribe("rnavarro", "seller") as sub:
            return [chunk async for chunk in _stream(_FakeRequest(10), sub, "token-viejo")]

    chunks = asyncio.run(scenario())
    assert chunks[-1].startswith("event: session.revoked")
    assert len(chunks) == 2  # "conectado" y el cierre, sin pings


def test_reset_password_revokes_open_streams(client):
    """Restablecer publica session.revoked para esa cuenta en el bus del proceso."""
    received: list[Event] = []
    original = event_bus.publish
    event_bus.publish = received.append  # type: ignore[method-assign]
    try:
        assert (
            _as("supervisor").post("/api/admin/accounts/rnavarro/reset-password").status_code == 200
        )
    finally:
        event_bus.publish = original  # type: ignore[method-assign]
    assert [e.type for e in received] == [SESSION_REVOKED]
    assert received[0].audience.usernames == {"rnavarro"}
