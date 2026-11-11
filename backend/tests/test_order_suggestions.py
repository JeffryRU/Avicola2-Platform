"""Sugerencia de la proyección a partir de los pedidos reales cargados."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert

from app.core.config import get_settings
from app.main import app
from app.planning.domain.models import Product
from app.planning.domain.orders import OrderLine, daily_units, product_for, weekday_median
from app.planning.infrastructure import cli
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.persistence.tables import dispatch_orders
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

TODAY = ZoneClock(get_settings().tz).today()
KG = [1.0, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0]
PRODUCTS = [Product(f"P{i + 1}", "BRASA", f"Brasa {i + 1}", kg, i) for i, kg in enumerate(KG)]
DAY = date(2026, 3, 2)


def _line(material: str, kg=0.0, units=0.0, sent_kg=0.0, sent_units=0.0, day=DAY) -> OrderLine:
    return OrderLine(day, material, kg, units, sent_kg, sent_units)


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        (_line("POLLO ENTERO BRASA MEDIANO (1.60-1.69)"), "P6"),
        (_line("POLLO ENTERO BRASA GRANDE (2.00-2.20)"), "P10"),
        (_line("POLLO ENTERO BRASA CHICO (0.90-0.99)"), "P1"),
        # Rangos que no empiezan en la décima: el producto de mayor peso que no pasa del inicio.
        (_line("POLLO ENTERO BRASA GRANDE (1.85-1.94)"), "P8"),
        # Sin rango: decide el peso promedio de lo despachado.
        (_line("POLLO ENTERO BRASA GRANDE (-)", sent_kg=178.4, sent_units=100), "P7"),
        (_line("POLLO ENTERO BRASA CHICO TIPO B (0.00-0.00)", sent_kg=128, sent_units=100), "P2"),
        # Sin rango y sin despacho, o con un peso imposible: no se puede saber.
        (_line("POLLO ENTERO BRASA GRANDE (-)"), None),
        (_line("POLLO ENTERO BRASA GRANDE (-)", sent_kg=500, sent_units=100), None),
    ],
)
def test_order_material_maps_to_a_catalog_product(line, expected) -> None:
    product = product_for(line, PRODUCTS)
    assert (product.id if product else None) == expected


def test_orders_in_kg_become_units() -> None:
    lines = [
        _line("POLLO ENTERO BRASA MEDIANO (1.60-1.69)", kg=160),
        _line("POLLO ENTERO BRASA MEDIANO (1.60-1.69)", kg=999, units=40),
        _line("POLLO ENTERO BRASA GRANDE (-)", kg=50),
    ]
    assert daily_units(lines, PRODUCTS) == {DAY: {"P6": pytest.approx(140)}}


def test_median_of_the_same_weekday_ignores_an_odd_week() -> None:
    mondays = [DAY - timedelta(weeks=w) for w in range(1, 5)]
    history = dict(zip(mondays, [{"P6": 100}, {"P6": 900}, {"P6": 120}, {"P6": 110}], strict=True))
    history[DAY - timedelta(days=1)] = {"P6": 5000}  # otro día de la semana: no cuenta
    assert weekday_median(history, DAY) == {"P6": 115}
    # La carga puede tener semanas de atraso: se usan los últimos lunes que haya.
    assert weekday_median(history, DAY + timedelta(weeks=6)) == {"P6": 115}
    # Un lunes sin pedidos dentro de la historia cuenta como 0.
    del history[mondays[1]], history[mondays[2]]
    assert weekday_median(history, DAY) == {"P6": 50}
    assert weekday_median({mondays[0]: {"P6": 100}}, DAY) == {}


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
    return TestClient(app)


def _order(day: date, seller: str, material: str, kg: float) -> dict:
    return {
        "order_number": 1,
        "customer": "Cliente",
        "material_code": "X",
        "material": material,
        "ordered_kg": kg,
        "dispatched_kg": kg,
        "ordered_units": 0,
        "dispatched_units": 0,
        "zone": None,
        "registered_on": day,
        "delivery_date": day,
        "seller": seller,
    }


def test_suggestion_comes_from_the_sellers_real_orders(client) -> None:
    target = TODAY + timedelta(days=1)
    with SessionLocal() as session:
        rows = []
        for week in range(3, 8):  # la historia cargada termina hace tres semanas
            day = target - timedelta(weeks=week)
            rows.append(_order(day, "Rnavarro", "POLLO ENTERO BRASA MEDIANO (1.60-1.69)", 320))
            rows.append(_order(day, "Rnavarro", "BRASA MARINADO TT (-)", 999))
            rows.append(_order(day, "Hdias", "POLLO ENTERO BRASA GRANDE (1.80-1.89)", 900))
        session.execute(insert(dispatch_orders), rows)
        session.commit()
    r = client.post("/api/auth/login", json={"username": "rnavarro", "password": "demo1234"})
    assert r.status_code == 200
    params = {"category": "BRASA", "start": str(target), "days": 2}
    body = client.get("/api/suggestions", params=params).json()
    assert body["method"] == "order_history_median"
    # 320 kg de 1,6 kg = 200 unidades de Brasa 6; al día siguiente no hay historia.
    assert [d["units"] for d in body["days"]] == [{"P0006": 200}, {}]
