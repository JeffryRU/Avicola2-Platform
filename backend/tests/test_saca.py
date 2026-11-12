"""Cálculo de saca: max(proyección, pedidos confirmados) − stock, por producto."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.planning.domain.models import Product
from app.planning.domain.saca import METHOD_MAX, METHOD_SUM, build_plan, stock_window
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
    """Con la forma «mayor», lo proyectado y lo pedido no se suman: se toma el más grande."""
    plan = build_plan(
        DAY, [B1, B6], {"P1": 100, "P6": 50}, {"P1": 100, "P6": 80}, {}, METHOD_MAX, **CONTEXT
    )
    assert [line.demand for line in plan.lines] == [100, 80]
    assert plan.request == 180


def test_the_business_rule_adds_orders_to_the_projection() -> None:
    plan = build_plan(
        DAY, [B1, B6], {"P1": 100, "P6": 50}, {"P1": 100}, {"P6": 20}, METHOD_SUM, **CONTEXT
    )
    assert [line.demand for line in plan.lines] == [200, 50]
    assert plan.method == "sum" and plan.request == 230  # 200 + (50 − 20 de stock)


def test_farm_order_is_by_type_with_its_factor() -> None:
    b2 = Product("P2", "BRASA", "Brasa 2", 1.2, subcategory="Brasa chica")
    b1 = Product("P1", "BRASA", "Brasa 1", 1.0, subcategory="Brasa chica")
    b8 = Product("P8", "BRASA", "Brasa 8", 1.8, subcategory="Brasa grande")
    plan = build_plan(
        DAY,
        [b1, b2, b8],
        {"P1": 100, "P2": 50, "P8": 40},
        {"P1": 30},
        {"P2": 80},
        METHOD_SUM,
        **CONTEXT,
        group_factors=(("Brasa chica", 0.8),),
    )
    chica, grande = plan.groups
    # Chica: 150 proyectadas + 30 pedidas − 80 de stock = 100; a granja, el 80 %.
    assert (chica.projected, chica.ordered, chica.stock, chica.need) == (150, 30, 80, 100)
    assert chica.farm_order == 80
    # El stock de Brasa 2 sobra para ese rango (30 de más) y cubre parte de lo que falta de Brasa 1.
    assert [line.request for line in plan.lines[:2]] == [130, 0]
    # Un tipo sin factor configurado se pide completo.
    assert (grande.factor, grande.farm_order) == (1.0, 40)
    assert plan.farm_order == 120 and plan.request_by_group() == {
        "Brasa chica": 80.0,
        "Brasa grande": 40.0,
    }


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
    assert len(plan["lines"]) == 12  # todo el catálogo, también lo que no se pide
    assert by_id["P0001"] == {
        "product_id": "P0001",
        "projected": 150,
        "ordered": 0,
        "demand": 150,
        "stock": 30,
        "request": 120,
        "request_kg": 120.0,
        "expected": None,  # sin historia de producción todavía
        "expected_a": None,
    }
    assert by_id["P0006"]["request"] == 0  # 40 proyectadas, 60 en stock
    assert plan["projected"] == 190 and plan["stock"] == 90 and plan["request"] == 120
    assert plan["live_kg"] == round(120 / plan["yield_factor"], 2)
    assert plan["stock_date"] == str(TODAY)
    assert (plan["sellers_registered"], plan["sellers_total"]) == (2, 7)
    assert plan["orders_available"] is False  # no hay pedidos cargados para ese día
    assert plan["method"] == "sum"  # la regla del negocio es la de partida
    groups = {g["name"]: g for g in plan["groups"]}
    # A granja se pide por tipo: de lo que hace falta de brasa chica, el 80 %.
    assert groups["Brasa chica"]["need"] == 120 and groups["Brasa chica"]["factor"] == 0.8
    assert groups["Brasa chica"]["farm_order"] == 96
    assert groups["Brasa mediana"]["need"] == 0  # 40 proyectadas, 60 en stock
    assert plan["farm_order"] == 96


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


def test_loaded_orders_enter_the_saca_with_either_method(client) -> None:
    from sqlalchemy import insert

    from app.planning.infrastructure.persistence.tables import dispatch_orders

    row = {
        "order_number": 1,
        "customer": "Cliente",
        "material_code": "X",
        "material": "POLLO ENTERO BRASA MEDIANO (1.60-1.69)",
        "ordered_kg": 320,  # 200 unidades de Brasa 6 (1,6 kg)
        "dispatched_kg": 0,
        "ordered_units": 0,
        "dispatched_units": 0,
        "zone": None,
        "registered_on": TODAY,
        "delivery_date": TOMORROW,
        "seller": None,
    }
    with SessionLocal() as session:
        session.execute(
            insert(dispatch_orders), [row, {**row, "material": "BRASA MARINADO TT (-)"}]
        )
        session.commit()
    _login(client, "rnavarro")
    body = {"category": "BRASA", "days": [{"date": str(TOMORROW), "units": {"P0006": 150}}]}
    assert client.post("/api/projections", json=body).status_code == 201

    _login(client, "supervisor")
    plan = _saca(client, TOMORROW)
    assert plan["orders_available"] is True and plan["ordered"] == 200
    assert plan["request"] == 350  # regla del negocio: 150 proyectadas + 200 pedidas
    mediana = next(g for g in plan["groups"] if g["name"] == "Brasa mediana")
    assert (mediana["need"], mediana["factor"], mediana["farm_order"]) == (350, 0.7, 245)
    r = client.get("/api/saca", params={"date": str(TOMORROW), "method": "max"})
    assert r.json()["method"] == "max" and r.json()["request"] == 200  # manda lo mayor
    assert client.get("/api/saca", params={"date": str(TOMORROW), "method": "x"}).status_code == 422


def test_supervisors_change_the_factor_of_each_type(client) -> None:
    _login(client, "rnavarro")
    body = {"category": "BRASA", "days": [{"date": str(TOMORROW), "units": {"P0001": 100}}]}
    assert client.post("/api/projections", json=body).status_code == 201
    change = {"factors": {"Brasa chica": 0.9, "Brasa grande": 0.5}}
    assert client.put("/api/saca/factors", json=change).status_code == 403  # un vendedor no
    _login(client, "despacho")
    assert client.put("/api/saca/factors", json=change).status_code == 403

    _login(client, "supervisor")
    assert _saca(client, TOMORROW)["farm_order"] == 80  # de partida, chica × 0,80
    saved = client.put("/api/saca/factors", json=change)
    assert saved.status_code == 200, saved.text
    # Lo que no se indicó (mediana) queda en 1: se pide completo.
    assert saved.json()["factors"] == {
        "Brasa chica": 0.9,
        "Brasa mediana": 1.0,
        "Brasa grande": 0.5,
        "Pollo de mercado": 1.0,
    }
    plan = _saca(client, TOMORROW)
    assert plan["farm_order"] == 90
    assert {g["name"]: g["factor"] for g in plan["groups"]}["Brasa grande"] == 0.5

    for bad in ({"Brasa enorme": 1}, {"Brasa chica": -0.1}, {"Brasa chica": 3}, {}):
        r = client.put("/api/saca/factors", json={"factors": bad})
        assert r.status_code in (400, 422), bad


def test_saca_counts_only_recent_lots_and_quality_b_by_type(client) -> None:
    _login(client, "rnavarro")
    units = {"P0001": 300, "P0011": 50}
    for category, picked in (("BRASA", {"P0001": 300}), ("Pollo de mercado", {"P0011": 50})):
        body = {"category": category, "days": [{"date": str(TOMORROW), "units": picked}]}
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
    plan = _saca(client, TOMORROW)
    by_id = {line["product_id"]: line for line in plan["lines"]}
    # Brasa 1: cuentan los lotes de hoy y de hace 3 días (80); el de hace 4 no (se troza).
    assert by_id["P0001"]["stock"] == 80 and plan["stock_old"] == 500
    assert plan["stock_lot_days"] == 3 and plan["stock_b"] == 40
    groups = {g["name"]: g for g in plan["groups"]}
    # La calidad B descuenta del tipo: 300 − 80 − 40 = 180 hacen falta; a granja, el 80 %.
    chica = groups["Brasa chica"]
    assert (chica["stock"], chica["stock_b"], chica["need"], chica["farm_order"]) == (
        120,
        40,
        180,
        144,
    )
    # El pollo de mercado es un tipo más, sin factor: 50 − 10.
    assert groups["Pollo de mercado"]["farm_order"] == 40
    assert plan["farm_order"] == 184 and units["P0011"] == 50
