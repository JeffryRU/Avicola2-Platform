"""Cálculo de saca: stock − pedidos de mañana + proyección de pasado mañana + plus, por tipo."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.planning.domain.models import Product
from app.planning.domain.saca import build_plan, orders_day, projection_day, stock_window
from app.planning.infrastructure import cli
from app.planning.infrastructure.clock import ZoneClock
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

TODAY = ZoneClock(get_settings().tz).today()
TOMORROW = TODAY + timedelta(days=1)
AFTER_TOMORROW = TODAY + timedelta(days=2)
DAY = date(2026, 11, 12)
CHICA_1 = Product("P1", "BRASA", "Brasa 1", 1.0, subcategory="Brasa chica")
CHICA_2 = Product("P2", "BRASA", "Brasa 2", 1.2, subcategory="Brasa chica")
GRANDE = Product("P8", "BRASA", "Brasa 8", 1.8, subcategory="Brasa grande")
CONTEXT = {
    "stock_date": None,
    "sellers_registered": 1,
    "sellers_total": 1,
    "orders_available": True,
    "yield_factor": 0.8,
}
NO_PLUS = {
    "Brasa chica": 0,
    "Brasa mediana": 0,
    "Brasa grande": 0,
    "Pollo de mercado": 0,
}

# --- Dominio ----------------------------------------------------------------------------


def test_saca_is_stock_minus_orders_plus_projection_plus_plus() -> None:
    plan = build_plan(
        DAY,
        [CHICA_1, CHICA_2, GRANDE],
        projected={"P1": 100, "P2": 50, "P8": 40},
        ordered={"P1": 30},
        stock={"P2": 80},
        **CONTEXT,
        group_plus=(("Brasa chica", 4000), ("Brasa grande", 1500)),
    )
    chica, grande = plan.groups
    # Chica: 80 de stock − 30 pedidos + 150 proyectadas = 200; + 4000 de plus.
    assert (chica.stock, chica.ordered, chica.projected, chica.plus) == (80, 30, 150, 4000)
    assert (chica.balance, chica.farm_order) == (200, 4200)
    # Grande: 0 − 0 + 40 + 1500.
    assert grande.farm_order == 1540
    assert plan.farm_order == 5740 and plan.plus == 5500
    assert plan.request_by_group() == {"Brasa chica": 4200.0, "Brasa grande": 1540.0}


def test_more_stock_gives_a_bigger_saca() -> None:
    """La regla es literal: el stock se suma (no se descuenta)."""
    low = build_plan(DAY, [CHICA_1], {"P1": 100}, {}, {"P1": 10}, **CONTEXT)
    high = build_plan(DAY, [CHICA_1], {"P1": 100}, {}, {"P1": 90}, **CONTEXT)
    assert (low.farm_order, high.farm_order) == (110, 190)


def test_saca_never_goes_negative() -> None:
    plan = build_plan(DAY, [CHICA_1], {"P1": 10}, {"P1": 500}, {"P1": 20}, **CONTEXT)
    line, group = plan.lines[0], plan.groups[0]
    assert (line.balance, line.request) == (-470, 0)
    assert (group.balance, group.farm_order) == (-470, 0)
    # El plus se suma antes de cortar en 0.
    with_plus = build_plan(
        DAY,
        [CHICA_1],
        {"P1": 10},
        {"P1": 500},
        {"P1": 20},
        **CONTEXT,
        group_plus=(("Brasa chica", 4000),),
    )
    assert with_plus.farm_order == 3530


def test_per_product_lines_and_kg_leave_the_plus_out() -> None:
    plan = build_plan(DAY, [CHICA_1, CHICA_2], {"P1": 100}, {"P2": 10}, {"P1": 30}, **CONTEXT)
    assert [line.request for line in plan.lines] == [130, 0]
    assert plan.request == 130 and plan.request_kg == 130.0
    assert plan.live_kg == 162.5  # 130 kg de producto / 0,8 de rendimiento


def test_dates_are_relative_to_the_day_of_the_calculation() -> None:
    assert orders_day(DAY) == date(2026, 11, 13)
    assert projection_day(DAY) == date(2026, 11, 14)
    # El stock: hasta el mismo día, de los últimos 3 días.
    assert stock_window(DAY) == (date(2026, 11, 10), DAY)


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


def _project(client, username: str, units: dict[str, int], day=AFTER_TOMORROW) -> None:
    _login(client, username)
    body = {"category": "BRASA", "days": [{"date": str(day), "units": units}]}
    assert client.post("/api/projections", json=body).status_code == 201


def _saca(client, day=TODAY) -> dict:
    r = client.get("/api/saca", params={"date": str(day)})
    assert r.status_code == 200, r.text
    return r.json()


def _set_plus(client, plus: dict[str, int]) -> None:
    r = client.put("/api/saca/plus", json={"plus": plus})
    assert r.status_code == 200, r.text


def _insert_order(units_brasa_6: int, delivery: date) -> None:
    from sqlalchemy import insert

    from app.planning.infrastructure.persistence.tables import dispatch_orders

    row = {
        "order_number": 1,
        "customer": "Cliente",
        "material_code": "X",
        "material": "POLLO ENTERO BRASA MEDIANO (1.60-1.69)",
        "ordered_kg": units_brasa_6 * 1.6,
        "dispatched_kg": 0,
        "ordered_units": 0,
        "dispatched_units": 0,
        "zone": None,
        "registered_on": TODAY,
        "delivery_date": delivery,
        "seller": None,
    }
    with SessionLocal() as session:
        session.execute(insert(dispatch_orders), [row])
        session.commit()


def test_saca_uses_todays_stock_tomorrows_orders_and_the_projection_after(client) -> None:
    _project(client, "rnavarro", {"P0001": 100, "P0006": 40})
    _project(client, "hdias", {"P0001": 50})
    _project(client, "hdias", {"P0001": 999}, day=TOMORROW)  # otro día: no cuenta
    _insert_order(200, TOMORROW)  # 200 de Brasa 6 para mañana
    _insert_order(777, AFTER_TOMORROW)  # para pasado mañana: no cuenta
    _login(client, "despacho")
    lines = [{"product_id": "P0001", "units": 30}, {"product_id": "P0006", "units": 60}]
    assert client.put(f"/api/stock/{TODAY}", json={"lines": lines}).status_code == 200

    _login(client, "supervisor")
    _set_plus(client, {**NO_PLUS, "Brasa chica": 4000, "Brasa mediana": 1500})
    plan = _saca(client)
    assert (plan["date"], plan["orders_date"], plan["projection_date"]) == (
        str(TODAY),
        str(TOMORROW),
        str(AFTER_TOMORROW),
    )
    by_id = {line["product_id"]: line for line in plan["lines"]}
    assert len(plan["lines"]) == 12  # todo el catálogo
    assert by_id["P0001"] == {
        "product_id": "P0001",
        "projected": 150,
        "ordered": 0,
        "demand": 180,  # 30 − 0 + 150
        "stock": 30,
        "request": 180,
        "request_kg": 180.0,
        "expected": None,  # sin historia de producción todavía
        "expected_a": None,
    }
    assert by_id["P0006"]["demand"] == -100  # 60 − 200 + 40
    assert plan["stock_date"] == str(TODAY)
    assert (plan["sellers_registered"], plan["sellers_total"]) == (2, 7)
    assert plan["orders_available"] is True and plan["ordered"] == 200
    assert plan["method"] == "stock_orders_projection_plus"
    groups = {g["name"]: g for g in plan["groups"]}
    chica, mediana = groups["Brasa chica"], groups["Brasa mediana"]
    assert (chica["balance"], chica["plus"], chica["farm_order"]) == (180, 4000, 4180)
    # Mediana: 60 − 200 + 40 = −100; + 1500 de plus = 1400.
    assert (mediana["balance"], mediana["farm_order"]) == (-100, 1400)
    # Campos de compatibilidad (app móvil).
    assert (chica["need"], chica["factor"], chica["demand"]) == (4180, 1.0, 180)
    assert plan["plus"] == 5500 and plan["farm_order"] == 5580


def test_default_plus_is_the_business_rule(client) -> None:
    _login(client, "supervisor")
    plan = _saca(client, TODAY + timedelta(days=20))
    plus = {g["name"]: g["plus"] for g in plan["groups"]}
    assert plus == {
        "Brasa chica": 4000,
        "Brasa mediana": 1500,
        "Brasa grande": 1500,
        "Pollo de mercado": 4000,
    }
    # Sin stock, pedidos ni proyección: solo el plus.
    assert plan["stock_date"] is None and plan["sellers_registered"] == 0
    assert plan["farm_order"] == 11000


def test_only_supervisors_see_the_saca(client) -> None:
    for username in ("rnavarro", "despacho"):
        _login(client, username)
        assert client.get("/api/saca", params={"date": str(TODAY)}).status_code == 403
    _login(client, "general")
    assert client.get("/api/saca", params={"date": str(TODAY)}).status_code == 200
    client.cookies.clear()
    assert client.get("/api/saca", params={"date": str(TODAY)}).status_code == 401


def test_supervisors_change_the_plus_of_each_type(client) -> None:
    change = {"plus": {"Brasa chica": 100, "Brasa grande": 50}}
    _login(client, "rnavarro")
    assert client.put("/api/saca/plus", json=change).status_code == 403  # un vendedor no
    _login(client, "despacho")
    assert client.put("/api/saca/plus", json=change).status_code == 403

    _login(client, "supervisor")
    saved = client.put("/api/saca/plus", json=change)
    assert saved.status_code == 200, saved.text
    # Lo que no se indicó queda en 0: sin plus.
    assert saved.json()["plus"] == {
        "Brasa chica": 100,
        "Brasa mediana": 0,
        "Brasa grande": 50,
        "Pollo de mercado": 0,
    }
    assert _saca(client)["farm_order"] == 150

    for bad in ({"Brasa enorme": 1}, {"Brasa chica": -1}, {"Brasa chica": 100_001}, {}):
        r = client.put("/api/saca/plus", json={"plus": bad})
        assert r.status_code in (400, 422), bad
    # La ruta vieja de factores ya no existe.
    assert client.put("/api/saca/factors", json={"factors": {"Brasa chica": 1}}).status_code in (
        404,
        405,
    )


def test_saca_counts_only_recent_lots_and_quality_b_by_type(client) -> None:
    _login(client, "rnavarro")
    for category, picked in (("BRASA", {"P0001": 300}), ("Pollo de mercado", {"P0011": 50})):
        body = {"category": category, "days": [{"date": str(AFTER_TOMORROW), "units": picked}]}
        assert client.post("/api/projections", json=body).status_code == 201, category
    _login(client, "despacho")
    lots = {
        "lines": [
            {"product_id": "P0001", "units": 60, "lot_date": str(TODAY)},
            {"product_id": "P0001", "units": 20, "lot_date": str(TODAY - timedelta(days=3))},
            {"product_id": "P0001", "units": 500, "lot_date": str(TODAY - timedelta(days=4))},
            {"product_id": "P0101", "units": 40, "lot_date": str(TODAY)},  # Brasa chica B
            {"product_id": "P0011", "units": 10, "lot_date": str(TODAY)},
        ]
    }
    assert client.put(f"/api/stock/{TODAY}", json=lots).status_code == 200

    _login(client, "supervisor")
    _set_plus(client, NO_PLUS)
    plan = _saca(client)
    by_id = {line["product_id"]: line for line in plan["lines"]}
    # Brasa 1: cuentan los lotes de hoy y de hace 3 días (80); el de hace 4 no (se troza).
    assert by_id["P0001"]["stock"] == 80 and plan["stock_old"] == 500
    assert plan["stock_lot_days"] == 3 and plan["stock_b"] == 40
    groups = {g["name"]: g for g in plan["groups"]}
    # La calidad B se suma al stock del tipo: 80 + 40 − 0 + 300 = 420.
    chica = groups["Brasa chica"]
    assert (chica["stock"], chica["stock_b"], chica["farm_order"]) == (120, 40, 420)
    # El pollo de mercado es un tipo más: 10 − 0 + 50.
    assert groups["Pollo de mercado"]["farm_order"] == 60
    assert plan["farm_order"] == 480
