"""Stock de despacho: permisos del jefe de despacho, registro por día y consulta."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.planning.domain.permissions import (
    DISPATCH_CHIEF,
    GENERAL_SUPERVISOR,
    SELLER,
    SUPERVISOR,
    Permission,
    can,
    manageable_roles,
    permissions_of,
)
from app.planning.infrastructure import cli
from app.planning.infrastructure.clock import ZoneClock
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

TODAY = ZoneClock(get_settings().tz).today()
LINES = [{"product_id": "P0001", "units": 120, "kg": 118.4}, {"product_id": "P0006", "units": 40}]


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
    return TestClient(app)


def _login(client, username) -> dict:
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"username": username, "password": "demo1234"})
    assert r.status_code == 200, r.text
    return r.json()


def _range(days_back: int = 7) -> dict:
    return {"date_from": (TODAY - timedelta(days=days_back)).isoformat(), "date_to": str(TODAY)}


def test_dispatch_chief_permissions() -> None:
    assert permissions_of(DISPATCH_CHIEF) == {
        Permission.VIEW_STOCK,
        Permission.MANAGE_STOCK,
        Permission.VIEW_PRODUCTION,
        Permission.MANAGE_PRODUCTION,
    }
    assert manageable_roles(DISPATCH_CHIEF) == ()
    assert not can(SELLER, Permission.VIEW_STOCK)
    assert can(SUPERVISOR, Permission.VIEW_STOCK) and not can(SUPERVISOR, Permission.MANAGE_STOCK)
    assert can(GENERAL_SUPERVISOR, Permission.MANAGE_STOCK)
    assert DISPATCH_CHIEF in manageable_roles(GENERAL_SUPERVISOR)
    assert DISPATCH_CHIEF not in manageable_roles(SUPERVISOR)


def test_dispatch_chief_logs_in_with_only_dispatch_permissions(client) -> None:
    session = _login(client, "despacho")
    assert session["seller"]["role"] == "dispatch_chief"
    assert session["permissions"] == [
        "view_stock",
        "manage_stock",
        "view_production",
        "manage_production",
    ]
    assert session["manageable_roles"] == []


def test_register_and_view_daily_stock(client) -> None:
    _login(client, "despacho")
    assert client.get("/api/stock", params=_range()).json() == []

    r = client.put(f"/api/stock/{TODAY}", json={"lines": LINES})
    assert r.status_code == 200, r.text
    day = r.json()
    assert day["date"] == str(TODAY) and day["recorded_by"] == "despacho"
    assert day["total_units"] == 160
    # P0006 sin kg: 40 unidades por 1,6 kg de peso promedio.
    assert day["lines"] == [
        {"product_id": "P0001", "units": 120, "kg": 118.4},
        {"product_id": "P0006", "units": 40, "kg": 64.0},
    ]
    assert day["total_kg"] == 182.4

    yesterday = TODAY - timedelta(days=1)
    one = {"lines": [{"product_id": "P0002", "units": 5}]}
    assert client.put(f"/api/stock/{yesterday}", json=one).status_code == 200
    days = client.get("/api/stock", params=_range()).json()
    assert [d["date"] for d in days] == [str(TODAY), str(yesterday)]  # el más reciente primero


def test_registering_again_replaces_the_day(client) -> None:
    _login(client, "despacho")
    assert client.put(f"/api/stock/{TODAY}", json={"lines": LINES}).status_code == 200
    fixed = {"lines": [{"product_id": "P0001", "units": 0, "kg": 0}]}
    assert client.put(f"/api/stock/{TODAY}", json=fixed).status_code == 200
    days = client.get("/api/stock", params=_range()).json()
    assert len(days) == 1 and days[0]["total_units"] == 0
    assert [line["product_id"] for line in days[0]["lines"]] == ["P0001"]


@pytest.mark.parametrize(
    ("offset", "lines"),
    [
        (1, LINES),  # mañana: el stock no se estima
        (-8, LINES),  # demasiado atrás
        (0, [{"product_id": "NOPE", "units": 1}]),
        (0, [{"product_id": "P0001", "units": 1}, {"product_id": "P0001", "units": 2}]),
    ],
)
def test_register_validations(client, offset, lines) -> None:
    _login(client, "despacho")
    day = TODAY + timedelta(days=offset)
    assert client.put(f"/api/stock/{day}", json={"lines": lines}).status_code == 422
    assert client.put(f"/api/stock/{TODAY}", json={"lines": []}).status_code == 422
    negative = {"lines": [{"product_id": "P0001", "units": -1}]}
    assert client.put(f"/api/stock/{TODAY}", json=negative).status_code == 422


def test_who_sees_and_who_registers(client) -> None:
    _login(client, "despacho")
    assert client.put(f"/api/stock/{TODAY}", json={"lines": LINES}).status_code == 200

    _login(client, "rnavarro")  # el vendedor ni lo ve
    assert client.get("/api/stock", params=_range()).status_code == 403
    assert client.put(f"/api/stock/{TODAY}", json={"lines": LINES}).status_code == 403

    _login(client, "supervisor")  # el supervisor lo consulta, no lo registra
    assert len(client.get("/api/stock", params=_range()).json()) == 1
    assert client.put(f"/api/stock/{TODAY}", json={"lines": LINES}).status_code == 403

    _login(client, "general")
    assert client.put(f"/api/stock/{TODAY}", json={"lines": LINES}).status_code == 200
    assert client.get("/api/stock", params=_range()).json()[0]["recorded_by"] == "general"

    client.cookies.clear()
    assert client.get("/api/stock", params=_range()).status_code == 401


def test_dispatch_chief_cannot_do_seller_or_supervisor_things(client) -> None:
    _login(client, "despacho")
    body = {"category": "BRASA", "days": [{"date": str(TODAY), "units": {"P0001": 5}}]}
    assert client.post("/api/projections", json=body).status_code == 403
    assert client.get("/api/admin/accounts").status_code == 403
    cutoff = {"cutoff_time": "08:00", "days_before": 0}
    assert client.put("/api/admin/editing/cutoff", json=cutoff).status_code == 403
    # No ve las proyecciones del equipo ni aparece como vendedor.
    _login(client, "rnavarro")
    assert client.post("/api/projections", json=body).status_code == 201
    _login(client, "despacho")
    params = {"date_from": str(TODAY), "date_to": str(TODAY)}
    assert client.get("/api/projections", params=params).json() == []
    _login(client, "supervisor")
    assert "despacho" not in [s["username"] for s in client.get("/api/sellers").json()]


def test_only_the_general_supervisor_creates_dispatch_chiefs(client) -> None:
    new = {"username": "jdespacho", "name": "Jefa de despacho", "role": "dispatch_chief"}
    _login(client, "supervisor")
    assert client.post("/api/admin/accounts", json=new).status_code == 403
    _login(client, "general")
    assert client.post("/api/admin/accounts", json=new).status_code == 201
