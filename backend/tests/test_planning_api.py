"""API de planificación de punta a punta sobre SQLite en memoria."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.planning.infrastructure import cli
from app.planning.infrastructure.clock import ZoneClock
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

TODAY = ZoneClock(get_settings().tz).today()


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
    return TestClient(app)


def _login(client, username="rnavarro", password="demo1234") -> None:
    """La sesión queda en la cookie HttpOnly del cliente de pruebas."""
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text


def _day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def test_status_requires_session(client) -> None:
    assert client.get("/api/status").status_code == 401
    _login(client)
    body = client.get("/api/status").json()
    assert body["database"] and body["tables"] and body["dialect"] == "sqlite"


def test_login_rejects_bad_password(client) -> None:
    r = client.post("/api/auth/login", json={"username": "rnavarro", "password": "x"})
    assert r.status_code == 401


def test_endpoints_require_session(client) -> None:
    assert client.get("/api/catalog").status_code == 401
    client.cookies.set("nv_session", "nope", path="/api")
    assert client.get("/api/catalog").status_code == 401


def test_seller_sees_only_himself(client) -> None:
    _login(client)
    catalog = client.get("/api/catalog").json()
    assert {p["category"] for p in catalog} == {"BRASA"}
    assert [s["username"] for s in client.get("/api/sellers").json()] == ["rnavarro"]


def test_supervisor_sees_all_sellers(client) -> None:
    _login(client, "supervisor")
    usernames = [s["username"] for s in client.get("/api/sellers").json()]
    assert usernames == [
        "rnavarro",
        "hdias",
        "mcordova",
        "gfernandez",
        "jgonzales",
        "cvillalobos",
        "eauleste",
    ]


def test_submit_replaces_same_day_and_lists(client) -> None:
    _login(client)
    body = {"category": "BRASA", "days": [{"date": _day(0), "units": {"P0001": 10, "P0010": 1}}]}
    r = client.post("/api/projections", json=body)
    assert r.status_code == 201, r.text
    assert r.json() == {
        "submission_id": r.json()["submission_id"],
        "days": 1,
        "total_units": 11,
        "total_kg": 12.0,
    }
    body["days"][0]["units"] = {"P0002": 4}
    assert client.post("/api/projections", json=body).status_code == 201

    rows = client.get("/api/projections", params={"date_from": _day(0), "date_to": _day(0)}).json()
    assert len(rows) == 1
    assert rows[0]["seller"] == "rnavarro"
    assert rows[0]["total_units"] == 4 and rows[0]["units"]["P0002"] == 4


def test_supervisor_cannot_submit(client) -> None:
    _login(client, "supervisor")
    body = {"category": "BRASA", "days": [{"date": _day(0), "units": {"P0001": 1}}]}
    assert client.post("/api/projections", json=body).status_code == 403


def test_submit_validation_errors_are_422(client) -> None:
    _login(client)
    past = {"category": "BRASA", "days": [{"date": _day(-1), "units": {"P0001": 1}}]}
    r = client.post("/api/projections", json=past)
    assert r.status_code == 422 and "ya pasó" in r.json()["detail"]
    wrong = {"category": "BRASA", "days": [{"date": _day(0), "units": {"R1": 1}}]}
    assert client.post("/api/projections", json=wrong).status_code == 422


def test_sales_and_suggestions_use_history(client) -> None:
    with SessionLocal() as session:
        cli.seed_history(session, get_settings())
    _login(client)
    # Pedir a otro vendedor no sirve: el backend devuelve solo lo del vendedor de la sesión.
    params = {"date_from": _day(-7), "date_to": _day(-1), "seller": "hdias"}
    sales = client.get("/api/sales", params=params).json()
    assert len(sales) == 7 and all(s["seller"] == "rnavarro" for s in sales)
    others = client.get("/api/projections", params=params).json()
    assert others and all(p["seller"] == "rnavarro" for p in others)

    r = client.get("/api/suggestions", params={"category": "BRASA", "start": _day(0), "days": 3})
    body = r.json()
    assert body["method"] == "weekday_average"
    assert len(body["days"]) == 3 and all(sum(d["units"].values()) > 0 for d in body["days"])


def test_supervisor_can_filter_any_seller(client) -> None:
    with SessionLocal() as session:
        cli.seed_history(session, get_settings())
    _login(client, "supervisor")
    params = {"date_from": _day(-7), "date_to": _day(-1), "seller": "hdias"}
    sales = client.get("/api/sales", params=params).json()
    assert len(sales) == 7 and all(s["seller"] == "hdias" for s in sales)
