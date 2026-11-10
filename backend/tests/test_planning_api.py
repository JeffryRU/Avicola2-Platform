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


def test_supervisor_submits_on_behalf_of_a_seller(client) -> None:
    _login(client, "supervisor")
    body = {"category": "BRASA", "days": [{"date": _day(0), "units": {"P0001": 1}}]}
    # Sin vendedor no se sabe de quién es; un supervisor no es un vendedor.
    assert client.post("/api/projections", json=body).status_code == 422
    assert client.post("/api/projections", json={**body, "seller": "supervisor"}).status_code == 404
    assert client.post("/api/projections", json={**body, "seller": "rnavarro"}).status_code == 201
    stored = client.get(
        "/api/projections", params={"date_from": _day(0), "date_to": _day(0), "seller": "rnavarro"}
    ).json()
    assert [p["units"]["P0001"] for p in stored] == [1]


def test_seller_cannot_submit_for_someone_else(client) -> None:
    _login(client)
    body = {
        "category": "BRASA",
        "days": [{"date": _day(0), "units": {"P0001": 1}}],
        "seller": "hdias",
    }
    assert client.post("/api/projections", json=body).status_code == 403


def test_history_records_who_changed_what(client) -> None:
    _login(client)
    day = {"date": _day(1), "units": {"P0001": 4}}
    assert (
        client.post("/api/projections", json={"category": "BRASA", "days": [day]}).status_code
        == 201
    )
    # Reenviar lo mismo no es un cambio.
    assert (
        client.post("/api/projections", json={"category": "BRASA", "days": [day]}).status_code
        == 201
    )
    _login(client, "supervisor")
    edited = {
        "category": "BRASA",
        "days": [{"date": _day(1), "units": {"P0001": 9}}],
        "seller": "rnavarro",
    }
    assert client.post("/api/projections", json=edited).status_code == 201

    _login(client)
    params = {"date_from": _day(0), "date_to": _day(0)}
    history = client.get("/api/projections/history", params=params).json()
    assert [(h["author"], h["action"], h["before_total"], h["after_total"]) for h in history] == [
        ("supervisor", "updated", 4, 9),
        ("rnavarro", "created", None, 4),
    ]
    kinds = [n["title"] for n in client.get("/api/notifications").json()["items"]]
    assert any("actualizó tu proyección" in t for t in kinds)
    # Otro vendedor no ve el historial de Roberto.
    _login(client, "hdias")
    assert client.get("/api/projections/history", params=params).json() == []


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


# --- App móvil: token Bearer -----------------------------------------------------------


def _token(client, username="rnavarro", password="demo1234") -> str:
    r = client.post("/api/auth/token", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_token_login_returns_bearer_without_cookie(client) -> None:
    r = client.post("/api/auth/token", json={"username": "rnavarro", "password": "demo1234"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == get_settings().auth_token_ttl_hours * 3600
    assert body["seller"]["username"] == "rnavarro"
    assert "nv_session" not in r.cookies
    assert not client.cookies


def test_token_login_rejects_bad_password(client) -> None:
    r = client.post("/api/auth/token", json={"username": "rnavarro", "password": "mal"})
    assert r.status_code == 401
    assert "token" not in r.json()


def test_bearer_token_authenticates_requests(client) -> None:
    token = _token(client)
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["seller"]["username"] == "rnavarro"
    r = client.get("/api/sellers", headers={"Authorization": f"bearer {token}"})
    assert r.status_code == 200


def test_invalid_bearer_is_rejected(client) -> None:
    r = client.get("/api/sellers", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_bearer_takes_precedence_over_cookie(client) -> None:
    _login(client)  # cookie de rnavarro
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_non_bearer_authorization_falls_back_to_cookie(client) -> None:
    _login(client)
    r = client.get("/api/auth/me", headers={"Authorization": "Basic abc"})
    assert r.status_code == 200


def test_web_login_never_returns_token_in_body(client) -> None:
    r = client.post("/api/auth/login", json={"username": "rnavarro", "password": "demo1234"})
    assert "token" not in r.json()


# --- Exportar a Excel ---------------------------------------------------------------------


def _xlsx_rows(content: bytes) -> list[tuple]:
    from io import BytesIO

    from openpyxl import load_workbook

    return list(load_workbook(BytesIO(content)).active.iter_rows(values_only=True))


def test_export_projections_xlsx(client) -> None:
    _login(client, "rnavarro")
    day = TODAY.isoformat()
    body = {"category": "BRASA", "days": [{"date": day, "units": {"P0001": 5}}]}
    assert client.post("/api/projections", json=body).status_code == 201

    _login(client, "supervisor")
    r = client.get(f"/api/projections/export?date_from={day}&date_to={day}")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats")
    assert f"proyecciones_{day}_{day}.xlsx" in r.headers["content-disposition"]
    rows = _xlsx_rows(r.content)
    assert rows[0][0] == "Proyecciones del equipo"
    header, data = rows[2], rows[3:]
    assert header[3] == "Vendedor" and header[11] == "Estado"
    mine = [row for row in data if row[3] == "Roberto Navarro"]
    assert any(row[5] == "P0001" and row[8] == 5 for row in mine)
    # Quien no registró aparece con una fila «Sin proyección».
    assert any(row[11] == "Sin proyección" and row[3] != "Roberto Navarro" for row in data)


def test_seller_exports_only_their_own(client) -> None:
    _login(client, "hdias")
    day = TODAY.isoformat()
    r = client.get(f"/api/projections/export?date_from={day}&date_to={day}&seller=rnavarro")
    assert r.status_code == 200
    sellers = {row[3] for row in _xlsx_rows(r.content)[3:]}
    assert sellers == {"Hebert Días"}


def test_export_range_is_limited(client) -> None:
    _login(client, "supervisor")
    far = (TODAY + timedelta(days=120)).isoformat()
    r = client.get(f"/api/projections/export?date_from={TODAY.isoformat()}&date_to={far}")
    assert r.status_code == 422


def test_export_in_the_same_formats_as_the_web(client) -> None:
    _login(client, "supervisor")
    day = TODAY.isoformat()
    base = f"/api/projections/export?date_from={day}&date_to={day}"
    pdf = client.get(f"{base}&format=pdf")
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF") and f"_{day}.pdf" in pdf.headers["content-disposition"]
    csv = client.get(f"{base}&format=csv")
    assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv")
    text = csv.content.decode("utf-8")
    assert text.startswith('\ufeff"Fecha","Día","Zona","Vendedor"')
    assert '"Sin proyección"' in text
    assert client.get(f"{base}&format=docx").status_code == 422


def test_each_new_registration_opens_a_new_sheet(client) -> None:
    """INS-06: registrar de nuevo un día abre otra hoja que reemplaza a la anterior (no suma)."""
    _login(client)
    day = _day(1)

    def submit(units: int) -> None:
        body = {"category": "BRASA", "days": [{"date": day, "units": {"P0001": units}}]}
        assert client.post("/api/projections", json=body).status_code == 201

    params = {"date_from": day, "date_to": day}
    submit(100)
    assert client.get("/api/projections", params=params).json()[0]["sheet"] == 1
    submit(60)  # segunda hoja del mismo día
    rows = client.get("/api/projections", params=params).json()
    assert len(rows) == 1 and rows[0]["sheet"] == 2
    assert rows[0]["total_units"] == 60  # vale la última hoja: no se suman 100 + 60
    submit(60)  # reenviar lo mismo no abre una hoja nueva
    assert client.get("/api/projections", params=params).json()[0]["sheet"] == 2
    submit(75)
    assert client.get("/api/projections", params=params).json()[0]["sheet"] == 3

    today = str(TODAY)
    history = client.get(
        "/api/projections/history", params={"date_from": today, "date_to": today}
    ).json()
    assert [(h["sheet"], h["before_total"], h["after_total"]) for h in reversed(history)] == [
        (1, None, 100),
        (2, 100, 60),
        (3, 60, 75),
    ]
