"""Historia de ARIS en la app: lo pedido es la proyección y lo despachado, la venta real."""

from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import insert, select

from app.core.config import get_settings
from app.main import app
from app.planning.infrastructure import cli
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.persistence.repositories import SqlProductRepository
from app.planning.infrastructure.persistence.tables import dispatch_orders
from app.planning.infrastructure.store_orders_import import load_store_orders
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

TODAY = ZoneClock(get_settings().tz).today()
PAST = TODAY - timedelta(days=60)


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
        row = {
            "order_number": 1,
            "customer": "Cliente",
            "material_code": "M1",
            "ordered_kg": 0.0,
            "dispatched_kg": 0.0,
            "zone": "TRUJILLO",
            "registered_on": PAST,
            "delivery_date": PAST,
        }
        session.execute(
            insert(dispatch_orders),
            [
                # Brasa 6 (1,60-1,69): Roberto pidió 30 y se despacharon 25.
                {
                    **row,
                    "material": "POLLO ENTERO BRASA (1.60-1.69)",
                    "ordered_units": 30,
                    "dispatched_units": 25,
                    "seller": "Rnavarro",
                },
                # Otro material (no es brasa): no cuenta.
                {
                    **row,
                    "material": "MENUDENCIA",
                    "ordered_units": 9,
                    "dispatched_units": 9,
                    "seller": "Rnavarro",
                },
                {
                    **row,
                    "material": "POLLO ENTERO BRASA (1.00-1.09)",
                    "ordered_units": 7,
                    "dispatched_units": 7,
                    "seller": "Hdias",
                },
            ],
        )
        session.commit()
    return TestClient(app)


def _login(client, username="rnavarro") -> None:
    r = client.post("/api/auth/login", json={"username": username, "password": "demo1234"})
    assert r.status_code == 200, r.text


def test_aris_orders_are_the_projection_and_dispatches_the_real_sale(client) -> None:
    _login(client)
    params = {"date_from": str(PAST), "date_to": str(PAST)}
    [projection] = client.get("/api/projections", params=params).json()
    assert projection["seller"] == "rnavarro" and projection["units"] == {"P0006": 30}
    [sale] = client.get("/api/sales", params=params).json()
    assert sale["units"] == {"P0006": 25}
    # El supervisor ve a todo el equipo.
    _login(client, "supervisor")
    sellers = {p["seller"] for p in client.get("/api/projections", params=params).json()}
    assert sellers == {"rnavarro", "hdias"}


def test_store_orders_report_feeds_the_orders_of_that_day(tmp_path: Path) -> None:
    metadata.drop_all(engine)
    metadata.create_all(engine)
    wb = Workbook()
    ws = wb.active
    ws.append([None, "Impreso"])
    ws.append([])
    ws.append([])
    ws.append(
        [
            None,
            "CENTRO SUMINIS.",
            "ZONA",
            "TIENDA",
            "TURNO",
            "FECHA",
            "FAMILIA",
            "CODIGO",
            "MATERIAL",
            "COD. PEDIDO",
            "CANTIDAD 1",
            "MEDIDA 1",
            "CANTIDAD 2",
            "MEDIDA 2",
            "RANGO",
        ]
    )
    day = TODAY.strftime("%d/%m/%Y")
    ws.append(
        [
            None,
            "C",
            "PIURA",
            "T1",
            "Mañana",
            day,
            "F",
            "SEPE-3",
            "Pollo Entero Brasa Grande",
            "00037154 ",
            20,
            "Kilogramo",
            10,
            "Unidad",
            "B7",
        ]
    )
    ws.append(
        [
            None,
            "C",
            "PIURA",
            "T1",
            "Mañana",
            day,
            "F",
            "SEPE-6",
            "Pollo Entero Brasa Chico Tipo B",
            "00037155 ",
            26,
            "Kilogramo",
            20,
            "Unidad",
            "",
        ]
    )
    ws.append(
        [
            None,
            "C",
            "PIURA",
            "T1",
            "Mañana",
            day,
            "F",
            "X",
            "Trozado Espinazo",
            "1",
            5,
            "Kilogramo",
            0,
            "Unidad",
            "",
        ]
    )
    path = tmp_path / "tiendas.xlsx"
    wb.save(path)
    with SessionLocal() as session:
        cli.init(session, get_settings())
        products = SqlProductRepository(session).list_active()
        assert load_store_orders(session, path, products) == (2, 0)
        # Reemplaza: cargar dos veces no duplica.
        assert load_store_orders(session, path, products) == (2, 0)
        session.commit()
        rows = session.execute(select(dispatch_orders.c.material, dispatch_orders.c.seller)).all()
    assert len(rows) == 2 and all(seller is None for _, seller in rows)
    assert any("BRASA 7" in m for m, _ in rows) and any("BRASA 1" in m for m, _ in rows)
    from app.planning.infrastructure.orders import LoadedOrders

    with SessionLocal() as session:
        units = LoadedOrders(session, SqlProductRepository(session)).units(TODAY)
    assert units == {"P0007": 10, "P0001": 20}


def test_model_projection_uses_only_earlier_history(client) -> None:
    # El modelo mira los últimos 4 días iguales de la semana: 3 semanas más de pedidos.
    with SessionLocal() as session:
        for weeks, units in ((1, 20), (2, 30), (3, 40)):
            day = PAST - timedelta(weeks=weeks)
            session.execute(
                insert(dispatch_orders).values(
                    order_number=weeks + 10,
                    customer="Cliente",
                    material_code="M1",
                    material="POLLO ENTERO BRASA (1.60-1.69)",
                    ordered_kg=0.0,
                    dispatched_kg=0.0,
                    ordered_units=units,
                    dispatched_units=units,
                    zone="TRUJILLO",
                    registered_on=day,
                    delivery_date=day,
                    seller="Rnavarro",
                )
            )
        session.commit()
    _login(client)
    week_later = str(PAST + timedelta(days=7))
    params = {"date_from": week_later, "date_to": week_later}
    [model] = client.get("/api/model-projections", params=params).json()
    # Mediana de 30, 20, 30 y 40.
    assert model["seller"] == "rnavarro" and model["units"] == {"P0006": 30}
    # El mismo día de la historia no se predice con su propio dato.
    same = {"date_from": str(PAST), "date_to": str(PAST)}
    assert client.get("/api/model-projections", params=same).json() == []
    too_long = {"date_from": str(PAST), "date_to": str(PAST + timedelta(days=400))}
    assert client.get("/api/model-projections", params=too_long).status_code == 422
