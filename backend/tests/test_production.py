"""Producción diaria: registro del jefe de despacho, importación y estimación de llegada."""

from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.core.config import get_settings
from app.main import app
from app.planning.domain.models import Product
from app.planning.domain.production import (
    MIN_HISTORY_DAYS,
    DailyProduction,
    ProductionLine,
    check_arrival,
    estimate_arrival,
    overall_error,
)
from app.planning.infrastructure import cli
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.production_import import read_production
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

TODAY = ZoneClock(get_settings().tz).today()
AT = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)
GROUPS = {"P1": "chica", "P2": "chica", "P6": "mediana"}

# --- Dominio: estimación de llegada ------------------------------------------------------


def _day(offset: int, p1: int, p2: int, b2: int = 0, ordered: float = 1000) -> DailyProduction:
    """Se pide todo en P1; llega repartido entre P1 y P2 (lo normal: se pide en un solo rango)."""
    lines = (
        ProductionLine("P1", ordered, p1, 0),
        ProductionLine("P2", 0, p2, b2),
        ProductionLine("P6", 500, 500, 0),
    )
    return DailyProduction(date(2026, 10, 1) + timedelta(days=offset), lines, "x", AT)


def test_arrival_spreads_the_order_across_ranges() -> None:
    history = [_day(i, p1=400, p2=600, b2=150) for i in range(20)]
    estimate = estimate_arrival(history, GROUPS, {"chica": 2000, "mediana": 300})
    assert estimate is not None and estimate.days == 20
    # Por cada ave chica pedida llegan 0,4 en P1 y 0,6 en P2; de P2, el 25 % sale en calidad B.
    assert estimate.expected == {"P1": 800, "P2": 1200, "P6": 300}
    assert estimate.expected_a == {"P1": 800, "P2": 900, "P6": 300}
    assert (estimate.date_from, estimate.date_to) == (date(2026, 10, 1), date(2026, 10, 20))


def test_recent_days_weigh_more() -> None:
    old = [_day(i, p1=800, p2=200) for i in range(30)]
    recent = [_day(30 + i, p1=200, p2=800) for i in range(14)]
    estimate = estimate_arrival(old + recent, GROUPS, {"chica": 1000})
    assert estimate is not None
    # Un promedio simple daría 609 en P1; el suavizado se acerca a lo reciente (200).
    assert 200 < estimate.expected["P1"] < 400
    assert estimate.expected["P1"] + estimate.expected["P2"] == 1000


def test_no_estimate_without_enough_history() -> None:
    history = [_day(i, 400, 600) for i in range(MIN_HISTORY_DAYS - 1)]
    assert estimate_arrival(history, GROUPS, {"chica": 100}) is None
    # Los días sin pedido o sin producción no cuentan como historia.
    blank = (ProductionLine("P1", 0, 0, 0),)
    empty = [
        DailyProduction(date(2026, 12, 1) + timedelta(days=i), blank, "x", AT) for i in range(30)
    ]
    assert estimate_arrival(history + empty, GROUPS, {"chica": 100}) is None


def test_the_model_is_checked_against_days_that_already_happened() -> None:
    history = [_day(i, p1=400, p2=600) for i in range(20)]
    checks = check_arrival(history, GROUPS)
    # Solo se comprueban días que ya tenían detrás la historia mínima.
    assert [c.date for c in checks] == [d.date for d in history[MIN_HISTORY_DAYS:]]
    # Cada día llega igual que los anteriores: el modelo acierta; suponer lo pedido, no.
    assert checks[0].expected == {"P1": 400, "P2": 600, "P6": 500}
    assert overall_error(checks) == 0
    # Se pidieron 1000 en P1 y llegaron 400 (600 de más) y 600 en P2 sin pedir: 1200 de 1500.
    assert overall_error(checks, naive=True) == pytest.approx(0.8)
    assert check_arrival(history[:MIN_HISTORY_DAYS], GROUPS) == []


# --- Importación del Excel ---------------------------------------------------------------


def test_reads_the_business_spreadsheet(tmp_path) -> None:
    book = Workbook()
    sheet = book.active
    sheet.title = "DB_CALIDA_B"
    sheet.append([None, "% CALIDAD Y AHOGADOS"])
    sheet.append(
        [
            None,
            "FECHA",
            "TIPO DE BRASA",
            "PEDIDO",
            "RANGO",
            "PRODUCCION",
            "CALIDAD A",
            "CALIDAD B",
            "Total Calidad B",
        ]
    )
    day = datetime(2026, 10, 30)
    sheet.append([None, day, "Brasa Chica", 7000, "B2", 1766, 1766, 0, 99])
    sheet.append([None, day, "Brasa Chica", 0, "B3", 3023, 1836, 1187, None])
    sheet.append([None, day, "Carne", 22000, "CARNE", 22000, 18690, 3310, None])
    sheet.append([None, datetime(2026, 10, 31), "Brasa Chica", 0, "B2", None, None, None, None])
    path = tmp_path / "produccion.xlsx"
    book.save(path)
    brasa = [Product(f"P{i:04d}", "BRASA", f"Brasa {i}", 1.0, sort_order=i) for i in range(1, 11)]

    days, skipped = read_production(path, brasa, AT)

    assert skipped == 0 and len(days) == 1  # el 31 no tiene datos; «Carne» no es un rango
    assert days[0].date == date(2026, 10, 30) and days[0].recorded_by == "importacion"
    assert list(days[0].lines) == [
        ProductionLine("P0003", 7000.0, 1766, 0),  # B2 = Brasa 3
        ProductionLine("P0004", 0.0, 3023, 1187),
    ]


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


LINES = [
    {"product_id": "P0003", "ordered": 4050, "produced": 1174, "quality_b": 120},
    {"product_id": "P0004", "produced": 1668, "quality_b": 400},
]


def test_dispatch_chief_registers_and_sees_production(client) -> None:
    _login(client, "despacho")
    r = client.put(f"/api/production/{TODAY}", json={"lines": LINES})
    assert r.status_code == 200, r.text
    day = r.json()
    assert (day["ordered"], day["produced"], day["quality_b"]) == (4050.0, 2842, 520)
    assert day["lines"][1] == {
        "product_id": "P0004",
        "ordered": 0.0,
        "produced": 1668,
        "quality_a": 1268,
        "quality_b": 400,
    }
    assert day["recorded_by"] == "despacho"
    params = {"date_from": str(TODAY - timedelta(days=7)), "date_to": str(TODAY)}
    assert [d["date"] for d in client.get("/api/production", params=params).json()] == [str(TODAY)]
    # Registrar de nuevo reemplaza el día.
    one = {"lines": [{"product_id": "P0003", "ordered": 10, "produced": 9}]}
    assert client.put(f"/api/production/{TODAY}", json=one).json()["produced"] == 9
    assert len(client.get("/api/production", params=params).json()[0]["lines"]) == 1


@pytest.mark.parametrize(
    ("offset", "lines"),
    [
        (1, LINES),  # mañana
        (-8, LINES),  # demasiado atrás
        (0, [{"product_id": "NOPE", "produced": 1}]),
        (0, [{"product_id": "P0003", "produced": 10, "quality_b": 11}]),  # B mayor que lo producido
        (0, [{"product_id": "P0003", "produced": 1}, {"product_id": "P0003", "produced": 2}]),
    ],
)
def test_production_validations(client, offset, lines) -> None:
    _login(client, "despacho")
    day = TODAY + timedelta(days=offset)
    assert client.put(f"/api/production/{day}", json={"lines": lines}).status_code == 422


def test_who_sees_and_who_registers_production(client) -> None:
    params = {"date_from": str(TODAY), "date_to": str(TODAY)}
    _login(client, "rnavarro")
    assert client.get("/api/production", params=params).status_code == 403
    _login(client, "supervisor")
    assert client.get("/api/production", params=params).status_code == 200
    assert client.put(f"/api/production/{TODAY}", json={"lines": LINES}).status_code == 403
    _login(client, "general")
    assert client.put(f"/api/production/{TODAY}", json={"lines": LINES}).status_code == 200


def test_saca_estimates_what_will_arrive_per_range(client) -> None:
    arrives = TODAY + timedelta(days=2)  # la proyección que se suma es la de pasado mañana
    _login(client, "supervisor")
    plan = client.get("/api/saca", params={"date": str(TODAY)}).json()
    assert plan["forecast"] is None and plan["lines"][0]["expected"] is None  # aún sin historia

    # 20 días de historia: lo pedido en chica (todo como Brasa 3) llega 40 % Brasa 3 y 60 % Brasa 4.
    with SessionLocal() as session:
        from app.planning.infrastructure.persistence.production import SqlProductionRepository

        repo = SqlProductionRepository(session)
        for back in range(1, 21):
            lines = (ProductionLine("P0003", 1000, 400, 0), ProductionLine("P0004", 0, 600, 150))
            repo.write(DailyProduction(TODAY - timedelta(days=back), lines, "importacion", AT))
        session.commit()
    _login(client, "rnavarro")
    body = {"category": "BRASA", "days": [{"date": str(arrives), "units": {"P0001": 500}}]}
    assert client.post("/api/projections", json=body).status_code == 201

    _login(client, "supervisor")
    zero = {"Brasa chica": 0, "Brasa mediana": 0, "Brasa grande": 0, "Pollo de mercado": 0}
    assert client.put("/api/saca/plus", json={"plus": zero}).status_code == 200
    plan = client.get("/api/saca", params={"date": str(TODAY)}).json()
    assert plan["request"] == 500
    assert plan["forecast"]["method"] == "ewma_7" and plan["forecast"]["days"] == 20
    by_id = {line["product_id"]: line for line in plan["lines"]}
    # Se piden 500 aves chicas (proyectadas como Brasa 1), pero llegarán como Brasa 3 y Brasa 4.
    # A granja van 500 (sin stock, pedidos ni plus).
    assert plan["farm_order"] == 500
    assert (by_id["P0001"]["expected"], by_id["P0003"]["expected"]) == (0, 200)
    assert (by_id["P0004"]["expected"], by_id["P0004"]["expected_a"]) == (300, 225)
    assert by_id["P0006"]["expected"] == 0  # mediana: no se pidió nada


def test_forecast_page_data(client) -> None:
    _login(client, "despacho")
    empty = client.get("/api/production/forecast").json()
    assert empty["available"] is False and empty["accuracy"] is None
    assert [g["name"] for g in empty["groups"]] == [
        "Brasa chica",
        "Brasa mediana",
        "Brasa grande",
        "Pollo de mercado",
    ]

    with SessionLocal() as session:
        from app.planning.infrastructure.persistence.production import SqlProductionRepository

        repo = SqlProductionRepository(session)
        for back in range(1, 21):
            lines = (ProductionLine("P0003", 1000, 400, 0), ProductionLine("P0004", 0, 600, 150))
            repo.write(DailyProduction(TODAY - timedelta(days=back), lines, "importacion", AT))
        session.commit()

    body = client.get("/api/production/forecast").json()
    assert body["available"] is True and body["days"] == 20
    chica = body["groups"][0]
    assert chica["last_ordered"] == 1000
    rates = {p["product_id"]: p for p in chica["products"]}
    assert rates["P0003"]["share"] == pytest.approx(0.4)
    assert rates["P0004"]["share"] == pytest.approx(0.6)
    assert rates["P0004"]["quality_a_rate"] == pytest.approx(0.75)
    accuracy = body["accuracy"]
    assert accuracy["days"] == 6 and accuracy["error"] == 0 and accuracy["naive_error"] == 1.2
    by_product = {p["product_id"]: p for p in accuracy["by_product"]}
    assert by_product["P0004"] == {
        "product_id": "P0004",
        "ordered": 0,
        "expected": 3600,
        "produced": 3600,
    }

    _login(client, "rnavarro")
    assert client.get("/api/production/forecast").status_code == 403
