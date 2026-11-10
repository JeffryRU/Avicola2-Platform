"""Cálculo de saca: max(proyección, pedidos confirmados) − stock, por producto."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.planning.domain.models import Product
from app.planning.domain.saca import build_plan, stock_window
from app.planning.infrastructure import cli
from app.planning.infrastructure.clock import ZoneClock
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

TODAY = ZoneClock(get_settings().tz).today()
TOMORROW = TODAY + timedelta(days=1)
DAY = date(2026, 11, 12)
B1 = Product("P1", "BRASA", "Brasa 1", 1.0)
B6 = Product("P6", "BRASA", "Brasa 6", 1.6)
CONTEXT = {
    "stock_date": None,
    "sellers_registered": 1,
    "sellers_total": 1,
    "orders_available": True,
    "yield_factor": 0.8,
}

# --- Dominio ----------------------------------------------------------------------------


def test_orders_do_not_add_to_the_projection() -> None:
    """Lo proyectado y lo pedido son la misma demanda: se toma el mayor, no la suma."""
    plan = build_plan(DAY, [B1, B6], {"P1": 100, "P6": 50}, {"P1": 100, "P6": 80}, {}, **CONTEXT)
    assert [line.demand for line in plan.lines] == [100, 80]
    assert plan.request == 180


def test_stock_is_subtracted_and_never_goes_negative() -> None:
    plan = build_plan(DAY, [B1, B6], {"P1": 100, "P6": 50}, {}, {"P1": 30, "P6": 70}, **CONTEXT)
    assert [line.request for line in plan.lines] == [70, 0]  # sobra stock de P6: no se pide
    assert plan.request == 70 and plan.request_kg == 70.0
    assert plan.live_kg == 87.5  # 70 kg de producto / 0,8 de rendimiento


def test_stock_window_is_the_previous_days() -> None:
    assert stock_window(DAY) == (date(2026, 11, 9), date(2026, 11, 11))


# --- API --------------------------------------------------------------------------------


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


def _project(client, username: str, units: dict[str, int]) -> None:
    _login(client, username)
    body = {"category": "BRASA", "days": [{"date": str(TOMORROW), "units": units}]}
    assert client.post("/api/projections", json=body).status_code == 201


def _saca(client, day=TOMORROW) -> dict:
    r = client.get("/api/saca", params={"date": str(day)})
    assert r.status_code == 200, r.text
    return r.json()


def test_saca_adds_the_team_and_subtracts_the_latest_stock(client) -> None:
    _project(client, "rnavarro", {"P0001": 100, "P0006": 40})
    _project(client, "hdias", {"P0001": 50})
    _login(client, "despacho")
    lines = [{"product_id": "P0001", "units": 30}, {"product_id": "P0006", "units": 60}]
    assert client.put(f"/api/stock/{TODAY}", json={"lines": lines}).status_code == 200

    _login(client, "supervisor")
    plan = _saca(client)
    by_id = {line["product_id"]: line for line in plan["lines"]}
    assert len(plan["lines"]) == 10  # todo el catálogo, también lo que no se pide
    assert by_id["P0001"] == {
        "product_id": "P0001",
        "projected": 150,
        "ordered": 0,
        "demand": 150,
        "stock": 30,
        "request": 120,
        "request_kg": 120.0,
    }
    assert by_id["P0006"]["request"] == 0  # 40 proyectadas, 60 en stock
    assert plan["projected"] == 190 and plan["stock"] == 90 and plan["request"] == 120
    assert plan["live_kg"] == round(120 / plan["yield_factor"], 2)
    assert plan["stock_date"] == str(TODAY)
    assert (plan["sellers_registered"], plan["sellers_total"]) == (2, 7)
    assert plan["orders_available"] is False  # aún no hay fuente de pedidos


def test_saca_without_recent_stock_or_projections(client) -> None:
    _login(client, "supervisor")
    plan = _saca(client, TODAY + timedelta(days=5))
    assert plan["stock_date"] is None and plan["request"] == 0 and plan["sellers_registered"] == 0


def test_only_supervisors_see_the_saca(client) -> None:
    for username in ("rnavarro", "despacho"):
        _login(client, username)
        assert client.get("/api/saca", params={"date": str(TOMORROW)}).status_code == 403
    _login(client, "general")
    assert client.get("/api/saca", params={"date": str(TOMORROW)}).status_code == 200
    client.cookies.clear()
    assert client.get("/api/saca", params={"date": str(TOMORROW)}).status_code == 401
