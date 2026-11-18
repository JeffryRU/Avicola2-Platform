"""Carga de los exports de ARIS desde la app (y desde n8n): reemplaza solo las fechas que trae,
avisa cuando faltan días y pide reentrenar el modelo."""

import io
import json
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import func, insert, select

from app.core.config import get_settings
from app.main import app
from app.planning.application.aris import INFO, OK, WARNING, level_for, missing_days
from app.planning.infrastructure import cli, scheduler
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.demand_model.store import SqlDemandModelStore
from app.planning.infrastructure.persistence.tables import dispatch_orders, model_runs, store_sales
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

TODAY = ZoneClock(get_settings().tz).today()
HEADER = (
    "PedidoCliente,NumeroPedido,PedidoDetalleMaterialCodigo,PedidoDetalleMaterial,"
    "PedidoDetalleKilos,PesoDespachado,PedidoDetalleCantidad,CantidadDespachada,PedidoZona,"
    "FechaRegistro,FechaEntrega,Vendedor"
)
MATERIAL = "POLLO ENTERO BRASA (1.60-1.69)"


def _line(day: date, units: int, order: int = 1, seller: str = "Rnavarro") -> str:
    return (
        f"Cliente,{order},M1,{MATERIAL},0,0,{units},{units},TRUJILLO,"
        f"{day.isoformat()},{day.isoformat()},{seller}"
    )


def _csv(*lines: str) -> bytes:
    return ("\n".join([HEADER, *lines]) + "\n").encode()


def _xlsx(day: date, units: int) -> bytes:
    """Como el Excel de ARIS: título arriba, fechas como fecha y números como número."""
    wb = Workbook()
    ws = wb.active
    ws.title = "DESPACHO"
    ws.append(["Reporte de despacho"])
    ws.append(HEADER.split(","))
    ws.append(
        [
            "Cliente", 4512968771.0, "M1", MATERIAL, 191.2, 182.0, 130.0, 130.0, "TRUJILLO",
            datetime.combine(day, datetime.min.time()), datetime.combine(day, datetime.min.time()),
            "Rnavarro",
        ]
    )  # fmt: skip
    sales = wb.create_sheet("VENTAS")
    sales.append(
        [
            "PedidoOdooDetalleID", "CodigoDocumentoEmitido", "TipoDocumentoEmitidoDescripcion",
            "TipoAgrupacion", "FechaPedido", "TiendaCodigo", "Tienda", "MaterialCodigoSAP",
            "MaterialDescripcion", "Cantidad", "UnidadMedidaCodigo_DET", "PrecioUnitario",
        ]
    )  # fmt: skip
    for _ in range(2):  # el export repite cada línea
        sales.append(
            [7.0, "B605-1", "BOLETA", "NULL", f"{day.isoformat()} 00:00:00", "T1", "Tienda 1",
             "100", MATERIAL, 3.0, "UN", 12.5]
        )  # fmt: skip
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
    return TestClient(app)


def _login(client, username: str) -> None:
    r = client.post("/api/auth/login", json={"username": username, "password": "demo1234"})
    assert r.status_code == 200, r.text


def _upload(client, content: bytes, name: str):
    return client.post("/api/aris/import", files={"file": (name, content)})


def _units_by_day() -> dict[date, float]:
    with SessionLocal() as session:
        t = dispatch_orders.c
        rows = session.execute(
            select(t.delivery_date, func.sum(t.dispatched_units)).group_by(t.delivery_date)
        )
        return dict(rows.all())


def test_upload_replaces_only_the_dates_in_the_file(client) -> None:
    _login(client, "supervisor")
    d1, d2, d3 = (TODAY - timedelta(days=n) for n in (3, 2, 1))
    r = _upload(client, _csv(_line(d1, 10), _line(d2, 20), _line(d2, 5, order=2)), "base.csv")
    assert r.status_code == 200, r.text
    assert r.json() == [
        {"kind": "despacho", "rows": 3, "skipped": 0, "date_from": str(d1), "date_to": str(d2)}
    ]
    # El día 2 se corrige y llega el día 3; el día 1 queda como estaba.
    r = _upload(
        client, _csv(_line(d2, 7), _line(d3, 30), "basura,x,,,,,,,,no-es-fecha,,"), "dia.csv"
    )
    assert r.json()[0]["skipped"] == 1
    assert _units_by_day() == {d1: 10, d2: 7, d3: 30}
    # Volver a subir lo mismo no duplica nada.
    _upload(client, _csv(_line(d2, 7), _line(d3, 30)), "dia.csv")
    assert _units_by_day() == {d1: 10, d2: 7, d3: 30}


def test_excel_from_aris_loads_dispatch_and_sales(client) -> None:
    _login(client, "despacho")
    day = TODAY - timedelta(days=1)
    r = _upload(client, _xlsx(day, 130), "DATA ARIS VENTAS DESPACHO.xlsx")
    assert r.status_code == 200, r.text
    assert {x["kind"]: x["rows"] for x in r.json()} == {"despacho": 1, "ventas": 1}
    assert _units_by_day() == {day: 130}
    with SessionLocal() as session:
        sale = session.execute(select(store_sales)).one()
        assert sale.date == day and sale.quantity == 3 and sale.grouping is None


def test_unknown_files_are_rejected_without_touching_history(client) -> None:
    _login(client, "supervisor")
    day = TODAY - timedelta(days=1)
    _upload(client, _csv(_line(day, 10)), "base.csv")
    for content, name in ((b"a,b\n1,2\n", "otra.csv"), (b"%PDF", "archivo.pdf"), (b"", "x.csv")):
        r = _upload(client, content, name)
        assert r.status_code == 422, (name, r.text)
    assert _units_by_day() == {day: 10}


def test_status_warns_only_when_days_are_missing(client) -> None:
    assert missing_days(TODAY - timedelta(days=1), TODAY) == 0
    assert missing_days(TODAY, TODAY) == 0
    assert missing_days(TODAY - timedelta(days=3), TODAY) == 2
    assert level_for(TODAY - timedelta(days=1), 0, 3) == OK
    assert level_for(TODAY - timedelta(days=2), 1, 3) == INFO
    assert level_for(TODAY - timedelta(days=9), 8, 3) == WARNING
    assert level_for(None, 0, 3) == WARNING

    _login(client, "supervisor")
    body = client.get("/api/aris/status").json()
    assert body["last_dispatch"] is None and body["level"] == WARNING
    _upload(client, _csv(_line(TODAY - timedelta(days=4), 10)), "a.csv")
    body = client.get("/api/aris/status").json()
    assert body["missing_days"] == 3 and body["level"] == WARNING
    _upload(client, _csv(_line(TODAY - timedelta(days=1), 10)), "b.csv")
    body = client.get("/api/aris/status").json()
    assert body["missing_days"] == 0 and body["level"] == OK


def test_sellers_cannot_load_or_see_the_status(client) -> None:
    _login(client, "rnavarro")
    assert client.get("/api/aris/status").status_code == 403
    assert _upload(client, _csv(_line(TODAY, 1)), "a.csv").status_code == 403


def test_service_endpoint_needs_the_token(client, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "ingest_api_token", "secreto")
    files = {"file": ("a.csv", _csv(_line(TODAY - timedelta(days=1), 4)))}
    assert client.post("/api/internal/aris", files=files).status_code == 401
    r = client.post("/api/internal/aris", files=files, headers={"X-Api-Token": "secreto"})
    assert r.status_code == 200, r.text
    assert _units_by_day() == {TODAY - timedelta(days=1): 4}


def test_a_load_asks_the_scheduler_to_retrain(client, monkeypatch) -> None:
    trained = []
    monkeypatch.setattr(scheduler.training, "train", lambda *_: trained.append(1))
    # Fuera de la ventana de madrugada: sin carga nueva no entrena.
    away = (ZoneClock(get_settings().tz).now().hour + 12) % 24
    settings = get_settings().model_copy(update={"model_train_hour": away})
    assert scheduler.train_demand_model(settings) == 0
    _login(client, "supervisor")
    _upload(client, _csv(_line(TODAY - timedelta(days=1), 4)), "a.csv")
    assert client.get("/api/aris/status").json()["training_pending"] is True
    assert scheduler.train_demand_model(settings) == 1 and trained == [1]
    # El pedido queda atendido cuando hay una corrida posterior.
    now = datetime.now(UTC)
    with SessionLocal() as session:
        summary = json.dumps({"trained_at": now.isoformat()})
        session.execute(insert(model_runs).values(trained_at=now, summary=summary))
        session.commit()
        assert SqlDemandModelStore(session).training_pending() is False
