"""Stock de despacho: permisos del jefe de despacho, registro por día y consulta."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

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
from app.planning.infrastructure.persistence.tables import sellers
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
        Permission.LOAD_ARIS,
    }
    assert manageable_roles(DISPATCH_CHIEF) == ()
    assert not can(SELLER, Permission.VIEW_STOCK)
    # El supervisor también corrige stock y producción si se lo piden (en la app, tras «Editar»).
    assert can(SUPERVISOR, Permission.VIEW_STOCK) and can(SUPERVISOR, Permission.MANAGE_STOCK)
    assert can(SUPERVISOR, Permission.MANAGE_PRODUCTION)
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
        "load_aris",
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
    # Los kg se calculan con el peso promedio; sin lote ni ubicación: el día y la general (por
    # defecto el stock se sube de forma general, sin elegir ubicación).
    lot = {"location": "General", "lot_date": str(TODAY)}
    assert day["lines"] == [
        {"product_id": "P0001", "units": 120, "kg": 120.0, **lot},
        {"product_id": "P0006", "units": 40, "kg": 64.0, **lot},
    ]
    assert day["total_kg"] == 184.0

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

    _login(client, "supervisor")  # lo consulta y, si se lo piden, lo corrige (tras «Editar»)
    assert len(client.get("/api/stock", params=_range()).json()) == 1
    assert client.put(f"/api/stock/{TODAY}", json={"lines": LINES}).status_code == 200

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


def test_stock_is_general_by_default(client) -> None:
    """«General» va primero (en la app, «Todas las ubicaciones»), luego las zonas de los
    vendedores; una ubicación que no es ninguna de esas no."""
    _login(client, "despacho")
    locations = client.get("/api/stock/options").json()["locations"]
    assert locations[0] == "General" and {"Trujillo", "Piura", "Chiclayo"} <= set(locations)
    lines = [{"product_id": "P0001", "units": 5}]
    r = client.put(f"/api/stock/{TODAY}", json={"location": "Lima", "lines": lines})
    assert r.status_code == 422


def test_a_new_seller_zone_is_a_stock_location(client) -> None:
    """Un vendedor de una zona nueva (Huaraz) la suma a las ubicaciones, sin configurar nada."""
    with SessionLocal() as session:
        session.execute(
            update(sellers).where(sellers.c.username == "rnavarro").values(zone="Huaraz")
        )
        session.commit()
    _login(client, "despacho")
    assert "Huaraz" in client.get("/api/stock/options").json()["locations"]
    lines = [{"product_id": "P0001", "units": 5}]
    r = client.put(f"/api/stock/{TODAY}", json={"location": "Huaraz", "lines": lines})
    assert r.status_code == 200, r.text


def test_stock_by_lot_and_location(client, monkeypatch) -> None:
    # Con varias ubicaciones configuradas se registra por ubicación.
    monkeypatch.setattr(get_settings(), "stock_locations", ["Almacén Norte"])
    _login(client, "despacho")
    options = client.get("/api/stock/options").json()
    assert options["locations"][:2] == ["General", "Almacén Norte"] and options["lot_days"] == 3
    names = {i["id"]: (i["name"], i["quality"]) for i in options["items"]}
    assert names["P0101"] == ("Brasa chica B", "B")
    assert names["P0011"] == ("Pollo entero con menudencia", "A")

    yesterday, old = TODAY - timedelta(days=1), TODAY - timedelta(days=5)
    trujillo = {
        "location": "Trujillo",
        "lines": [
            {"product_id": "P0001", "units": 100, "lot_date": str(TODAY)},
            {"product_id": "P0001", "units": 30, "lot_date": str(yesterday)},
            {"product_id": "P0101", "units": 40, "lot_date": str(old)},  # calidad B, lote viejo
            {"product_id": "P0011", "units": 7, "lot_date": str(TODAY)},  # pollo de mercado
        ],
    }
    assert client.put(f"/api/stock/{TODAY}", json=trujillo).status_code == 200
    piura = {"location": "Piura", "lines": [{"product_id": "P0001", "units": 5}]}
    day = client.put(f"/api/stock/{TODAY}", json=piura).json()
    # Guardar Piura no toca Trujillo: el día trae las dos ubicaciones.
    assert day["total_units"] == 182
    assert {(line["location"], line["lot_date"]) for line in day["lines"]} == {
        ("Trujillo", str(TODAY)),
        ("Trujillo", str(yesterday)),
        ("Trujillo", str(old)),
        ("Piura", str(TODAY)),
    }
    # Volver a guardar una ubicación reemplaza solo esa.
    piura["lines"][0]["units"] = 9
    assert client.put(f"/api/stock/{TODAY}", json=piura).json()["total_units"] == 186

    bad_lines = (
        [{"product_id": "P0001", "units": 1, "lot_date": str(TODAY + timedelta(days=1))}],
        [{"product_id": "P0001", "units": 1, "lot_date": str(TODAY - timedelta(days=30))}],
        [{"product_id": "P0001", "units": 1}, {"product_id": "P0001", "units": 2}],
    )
    for lines in bad_lines:
        assert client.put(f"/api/stock/{TODAY}", json={"lines": lines}).status_code == 422
    other = {"location": "Marte", "lines": [{"product_id": "P0001", "units": 1}]}
    assert client.put(f"/api/stock/{TODAY}", json=other).status_code == 422
