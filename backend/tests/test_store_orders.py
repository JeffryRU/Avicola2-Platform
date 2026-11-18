"""Pedidos de las tiendas por zona: la columna «Tiendas» de los dashboards."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert

from app.core.config import get_settings
from app.main import app
from app.planning.domain.store_orders import sales_zone
from app.planning.infrastructure import cli
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.persistence.repositories import SqlProductRepository
from app.planning.infrastructure.persistence.tables import dispatch_orders
from app.planning.infrastructure.store_orders_import import STORE_CODE_PREFIX
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

TODAY = ZoneClock(get_settings().tz).today()
ZONES = ["Chiclayo", "Piura", "San Martín", "Trujillo"]


def test_report_zones_take_the_sellers_names() -> None:
    aliases = {"LA LIBERTAD": "Trujillo"}  # STORE_ZONE_ALIASES
    assert sales_zone("LA LIBERTAD", ZONES, aliases) == "Trujillo"
    assert sales_zone("LA LIBERTAD", ZONES) == "La Libertad"  # sin el alias, queda tal cual
    assert sales_zone("SAN MARTIN", ZONES) == "San Martín"
    assert sales_zone(" piura ", ZONES) == "Piura"
    assert sales_zone("LIMA NORTE", ZONES) == "Lima Norte"
    assert sales_zone("", ZONES) is None and sales_zone(None, ZONES) is None


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
        brasa = {p.id: p for p in SqlProductRepository(session).list_active()}

        def row(n: int, zone: str, units: float, day=TODAY, code: str = "SEPE-3") -> dict:
            w = brasa[f"P000{n}"].kg_per_unit
            return {
                "order_number": n,
                "customer": "220402 - NORAVES Trujillo",
                "material_code": f"{STORE_CODE_PREFIX}{code}",
                "material": f"POLLO ENTERO BRASA TIENDA BRASA {n} ({w:.2f}-{w + 0.09:.2f})",
                "ordered_kg": 0.0,
                "dispatched_kg": 0.0,
                "ordered_units": units,
                "dispatched_units": 0.0,
                "zone": zone,
                "registered_on": day,
                "delivery_date": day,
                "seller": None,
            }

        session.execute(
            insert(dispatch_orders),
            [
                row(7, "LA LIBERTAD", 10),
                row(7, "LA LIBERTAD", 5),
                row(1, "SAN MARTIN", 20),
                row(7, "PIURA", 8, day=TODAY + timedelta(days=1)),
                # Un pedido de ARIS (no es de tienda): no cuenta.
                {**row(7, "TRUJILLO", 99), "material_code": "M1"},
            ],
        )
        session.commit()
    return TestClient(app)


def _login(client, username: str) -> None:
    r = client.post("/api/auth/login", json={"username": username, "password": "demo1234"})
    assert r.status_code == 200, r.text


def test_supervisor_sees_store_orders_by_zone_and_day(client) -> None:
    _login(client, "supervisor")
    r = client.get(
        "/api/store-orders",
        params={"date_from": str(TODAY), "date_to": str(TODAY + timedelta(days=1))},
    )
    assert r.status_code == 200, r.text
    got = {(d["zone"], d["date"]): d["units"] for d in r.json()}
    assert got == {
        ("Piura", str(TODAY + timedelta(days=1))): {"P0007": 8},
        ("San Martín", str(TODAY)): {"P0001": 20},
        ("Trujillo", str(TODAY)): {"P0007": 15},
    }


def test_sellers_cannot_see_store_orders(client) -> None:
    _login(client, "rnavarro")
    r = client.get("/api/store-orders", params={"date_from": str(TODAY), "date_to": str(TODAY)})
    assert r.status_code == 403


def test_aris_loads_keep_store_orders_and_ignore_them_in_the_coverage(client) -> None:
    _login(client, "supervisor")
    header = (
        "PedidoCliente,NumeroPedido,PedidoDetalleMaterialCodigo,PedidoDetalleMaterial,"
        "PedidoDetalleKilos,PesoDespachado,PedidoDetalleCantidad,CantidadDespachada,PedidoZona,"
        "FechaRegistro,FechaEntrega,Vendedor"
    )
    past = TODAY - timedelta(days=2)
    line = f"C,1,M1,POLLO ENTERO BRASA (1.60-1.69),0,0,4,4,TRUJILLO,{TODAY},{TODAY},Rnavarro"
    old = f"C,2,M1,POLLO ENTERO BRASA (1.60-1.69),0,0,4,4,TRUJILLO,{past},{past},Rnavarro"
    content = "\n".join([header, line, old, ""]).encode()
    r = client.post("/api/aris/import", files={"file": ("a.csv", content)})
    assert r.status_code == 200, r.text
    # La carga de ARIS de hoy no borró los pedidos de tiendas de hoy.
    r = client.get("/api/store-orders", params={"date_from": str(TODAY), "date_to": str(TODAY)})
    assert {d["zone"] for d in r.json()} == {"San Martín", "Trujillo"}
    # La cobertura de ARIS no cuenta los pedidos de tiendas de mañana.
    assert client.get("/api/aris/status").json()["last_dispatch"] == str(TODAY)
