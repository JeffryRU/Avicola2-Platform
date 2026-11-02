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


def _login(client, username="jperez", password="demo1234") -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def test_status_reports_tables(client) -> None:
    body = client.get("/api/status").json()
    assert body["database"] and body["tables"] and body["dialect"] == "sqlite"


def test_login_rejects_bad_password(client) -> None:
    r = client.post("/api/auth/login", json={"username": "jperez", "password": "x"})
    assert r.status_code == 401


def test_endpoints_require_token(client) -> None:
    assert client.get("/api/catalog").status_code == 401
    bad = {"Authorization": "Bearer nope"}
    assert client.get("/api/catalog", headers=bad).status_code == 401


def test_catalog_and_sellers(client) -> None:
    h = _login(client)
    catalog = client.get("/api/catalog", headers=h).json()
    assert {p["category"] for p in catalog} == {"BRASA", "BROASTER"}
    assert len(client.get("/api/sellers", headers=h).json()) == 3


def test_submit_replaces_same_day_and_lists(client) -> None:
    h = _login(client)
    body = {"category": "BRASA", "days": [{"date": _day(0), "units": {"B1": 10, "B10": 1}}]}
    r = client.post("/api/projections", json=body, headers=h)
    assert r.status_code == 201, r.text
    assert r.json() == {
        "submission_id": r.json()["submission_id"],
        "days": 1,
        "total_units": 11,
        "total_kg": 15.0,
    }
    body["days"][0]["units"] = {"B2": 4}
    assert client.post("/api/projections", json=body, headers=h).status_code == 201

    rows = client.get(
        "/api/projections", params={"date_from": _day(0), "date_to": _day(0)}, headers=h
    ).json()
    assert len(rows) == 1
    assert rows[0]["seller"] == "jperez"
    assert rows[0]["total_units"] == 4 and rows[0]["units"]["B2"] == 4


def test_submit_validation_errors_are_422(client) -> None:
    h = _login(client)
    past = {"category": "BRASA", "days": [{"date": _day(-1), "units": {"B1": 1}}]}
    r = client.post("/api/projections", json=past, headers=h)
    assert r.status_code == 422 and "ya pasó" in r.json()["detail"]
    wrong = {"category": "BRASA", "days": [{"date": _day(0), "units": {"R1": 1}}]}
    assert client.post("/api/projections", json=wrong, headers=h).status_code == 422


def test_sales_and_suggestions_use_history(client) -> None:
    with SessionLocal() as session:
        cli.seed_history(session, get_settings())
    h = _login(client)
    params = {"date_from": _day(-7), "date_to": _day(-1), "seller": "mrios"}
    sales = client.get("/api/sales", params=params, headers=h).json()
    assert len(sales) == 7 and all(s["seller"] == "mrios" for s in sales)

    r = client.get(
        "/api/suggestions", params={"category": "BRASA", "start": _day(0), "days": 3}, headers=h
    )
    body = r.json()
    assert body["method"] == "weekday_average"
    assert len(body["days"]) == 3 and all(sum(d["units"].values()) > 0 for d in body["days"])
