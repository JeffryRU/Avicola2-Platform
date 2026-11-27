"""Modelo de llegada que se ajusta solo: compiten varios y se usa el que menos falló."""

import random
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.core.config import get_settings
from app.main import app
from app.planning.domain.models import Product
from app.planning.domain.production import DailyProduction, ProductionLine, latest_weights
from app.planning.infrastructure import cli
from app.planning.infrastructure.arrival_model import HYBRID, AdaptiveArrivalModel
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.production_import import read_production
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

TODAY = ZoneClock(get_settings().tz).today()
AT = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)
GROUPS = {"P1": "chica", "P2": "chica"}
START = date(2026, 6, 1)


def _day(offset: int, p1: int, weight: float | None = None) -> DailyProduction:
    """Se piden 1000 aves chicas en P1; llegan `p1` en P1 y el resto en P2."""
    lines = (ProductionLine("P1", 1000, p1, 0), ProductionLine("P2", 0, 1000 - p1, 100))
    weights = {"chica": weight} if weight else {}
    return DailyProduction(START + timedelta(days=offset), lines, "x", AT, weights)


def test_half_life_adjusts_itself_to_how_fast_things_change() -> None:
    # La llegada cambia de golpe cada pocos días: gana quien olvida rápido.
    history = [_day(i, 800 if (i // 5) % 2 else 200) for i in range(60)]
    fitted = AdaptiveArrivalModel().fit(history, GROUPS)
    assert fitted is not None and fitted.model == "ewma_3"
    assert set(fitted.candidates) == {"ewma_3", "ewma_7", "ewma_14"}  # sin pesos no hay híbrido
    assert fitted.candidates["ewma_3"] < fitted.candidates["ewma_14"]
    assert fitted.weights == {} and len(fitted.checks) == 14


def test_switches_to_the_weight_model_when_weight_explains_the_arrival() -> None:
    # Parvada liviana: casi todo llega en P1; pesada: casi todo en P2. Sin orden en el tiempo.
    rng = random.Random(7)  # noqa: S311 (datos de prueba)
    history = []
    for i in range(120):
        light = rng.random() < 0.5
        history.append(_day(i, 800 if light else 200, 1.6 if light else 1.9))
    model = AdaptiveArrivalModel()

    light = model.fit(history, GROUPS, {"chica": 1.6})
    heavy = model.fit(history, GROUPS, {"chica": 1.9})

    assert light is not None and heavy is not None and light.model == HYBRID
    assert light.candidates[HYBRID] < min(v for k, v in light.candidates.items() if k != HYBRID)
    assert light.rates.share["P1"] > 0.65 and heavy.rates.share["P1"] < 0.35
    assert light.weights == {"chica": 1.6}
    # Sin indicar el peso se supone el último anotado.
    assert model.fit(history, GROUPS).weights == latest_weights(history)
    # La calidad B sigue saliendo de la historia: 100 de cada 800 o 200 que llegan en P2.
    assert 0.1 < light.rates.b_rate["P2"] < 0.5


def test_no_model_without_enough_history() -> None:
    assert AdaptiveArrivalModel().fit([_day(i, 500) for i in range(5)], GROUPS) is None


def test_the_spreadsheet_brings_the_flock_weight(tmp_path) -> None:
    book = Workbook()
    sheet = book.active
    sheet.title = "DB_CALIDA_B"
    head = ["FECHA", "TIPO DE BRASA", "PESO PROMEDIO", "PEDIDO", "RANGO", "PRODUCCION"]
    sheet.append([*head, "CALIDAD A", "CALIDAD B"])
    day = datetime(2026, 10, 30)
    sheet.append([day, "Brasa Chica", 1.72, 7000, "B2", 1766, 1766, 0])
    sheet.append([day, "Brasa Chica", None, 0, "B3", 3023, 1836, 1187])
    sheet.append([day, "Brasa Mediana", "2.33 Y 2.32 Y 2.34", 5000, "B5", 4000, 4000, 0])
    sheet.append([day, "Brasa Grande", "sin dato", 3000, "B7", 2500, 2500, 0])
    path = tmp_path / "produccion.xlsx"
    book.save(path)
    groups = ["chica"] * 5 + ["mediana"] * 2 + ["grande"] * 3
    brasa = [
        Product(f"P{i:04d}", "BRASA", f"Brasa {i}", 1.0, sort_order=i, subcategory=groups[i - 1])
        for i in range(1, 11)
    ]

    days, _ = read_production(path, brasa, AT)

    assert days[0].weights == {"chica": 1.72, "mediana": 2.33}


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


LINES = [{"product_id": "P0003", "ordered": 4050, "produced": 1174, "quality_b": 120}]


def test_dispatch_chief_records_the_flock_weight(client) -> None:
    _login(client, "despacho")
    body = {"lines": LINES, "weights": {"Brasa chica": 1.724, "Brasa mediana": 2.33}}
    saved = client.put(f"/api/production/{TODAY}", json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()["weights"] == {"Brasa chica": 1.724, "Brasa mediana": 2.33}
    params = {"date_from": str(TODAY), "date_to": str(TODAY)}
    assert client.get("/api/production", params=params).json()[0]["weights"] == body["weights"]
    # Una corrección sin pesos los quita; el peso es opcional.
    assert client.put(f"/api/production/{TODAY}", json={"lines": LINES}).json()["weights"] == {}

    for weights in ({"Brasa enorme": 2.0}, {"Brasa chica": 0.1}, {"Brasa chica": 9}):
        r = client.put(f"/api/production/{TODAY}", json={"lines": LINES, "weights": weights})
        assert r.status_code in (400, 422), weights


def test_forecast_reports_the_model_in_use(client) -> None:
    from app.planning.infrastructure.persistence.production import SqlProductionRepository

    with SessionLocal() as session:
        repo = SqlProductionRepository(session)
        for back in range(1, 21):
            lines = (ProductionLine("P0003", 1000, 400, 0), ProductionLine("P0004", 0, 600, 150))
            day = DailyProduction(
                TODAY - timedelta(days=back), lines, "importacion", AT, {"Brasa chica": 1.7}
            )
            repo.write(day)
        session.commit()
    _login(client, "despacho")
    body = client.get("/api/production/forecast", params={"weight": [1.8, 0, 0]}).json()
    assert body["method"] == "ewma_7"  # todos empatan: se queda el de partida
    assert [c["name"] for c in body["candidates"]] == ["ewma_7", "ewma_3", "ewma_14"]
    assert body["weights_used"] == {}  # con 20 días aún no compite el modelo con peso
    assert body["groups"][0]["last_weight"] == 1.7 and body["groups"][1]["last_weight"] is None
    assert client.get("/api/production/forecast", params={"weight": [9]}).status_code == 422
