"""Modelo de demanda (ADR 0020): entrena con la historia de ARIS, guarda métricas y predicciones,
y la sugerencia y la API las usan."""

from datetime import date, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert

from app.core.config import get_settings
from app.main import app
from app.planning.infrastructure import cli
from app.planning.infrastructure.demand_model import training
from app.planning.infrastructure.persistence.repositories import SqlProductRepository
from app.planning.infrastructure.persistence.tables import dispatch_orders
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

START = date(2026, 1, 5)
DAYS = 160
MATERIALS = [
    "POLLO ENTERO BRASA (1.60-1.69)",
    "POLLO ENTERO BRASA (1.80-1.89)",
    # El pollo sin menudencia también se proyecta: el modelo lo aprende por su material.
    "POLLO ENTERO CARNE SIN MENUDENCIA (-)",
]


def _history(session) -> None:
    rng = np.random.default_rng(3)
    rows = []
    for seller, base in (("Rnavarro", 40), ("Hdias", 25), ("Mcordova", 15), ("Eventual", 5)):
        for i in range(DAYS):
            day = START + timedelta(days=i)
            if seller == "Eventual" and i % 9:
                continue  # pocos días: solo enseña al maestro
            for m, material in enumerate(MATERIALS):
                units = int(base * (1.4 if day.weekday() in (4, 5) else 1) * (1 - 0.4 * m))
                units = max(0, units + int(rng.integers(-3, 4)))
                rows.append(
                    {
                        "order_number": i,
                        "customer": f"Cliente {seller} {m}",
                        "material_code": f"M{m}",
                        "material": material,
                        "ordered_kg": 0.0,
                        "dispatched_kg": 0.0,
                        "ordered_units": units,
                        "dispatched_units": units,
                        "zone": "TRUJILLO",
                        "registered_on": day,
                        "delivery_date": day,
                        "seller": seller,
                    }
                )
    session.execute(insert(dispatch_orders), rows)
    session.commit()


@pytest.fixture
def trained():
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
        _history(session)
        return training.train(session, SqlProductRepository(session).list_active())


def _login(client, username) -> None:
    r = client.post("/api/auth/login", json={"username": username, "password": "demo1234"})
    assert r.status_code == 200, r.text


def test_training_measures_every_model_on_unseen_days(trained) -> None:
    assert trained is not None
    assert trained["sellers"] == ["hdias", "mcordova", "rnavarro"]
    assert trained["series_teacher"] == 4  # el maestro también aprende del vendedor eventual
    names = {m["key"] for m in trained["models"]}
    assert {"actual", "robusta", "destilado", "apilado"} <= names
    for m in trained["models"]:
        assert set(m["metrics"]) == {
            "detalle", "vendedor_dia", "tamano_dia", "equipo_dia", "equipo_semana", "sesgo",
        }  # fmt: skip
    # Cada uso toma el modelo de menor error en su nivel.
    errors = {m["key"]: m["metrics"] for m in trained["models"]}
    for use, level in training.USES.items():
        best = min((k for k in errors if k != "actual"), key=lambda k: errors[k][level])
        assert trained["chosen"][use] == best
    # La división es temporal: entrenamiento < validación < prueba.
    split = trained["split"]
    assert split["entrenamiento"][1] < split["validacion"][0] <= split["validacion"][1]
    assert split["validacion"][1] < split["prueba"][0]
    assert trained["forecast_dates"] == [
        str(START + timedelta(days=DAYS)),
        str(START + timedelta(days=DAYS + 1)),
    ]


def test_summary_is_for_supervision_and_suggestion_uses_the_model(trained) -> None:
    client = TestClient(app)
    _login(client, "supervisor")
    body = client.get("/api/model/summary").json()
    assert body["chosen"]["sugerencia"] in {m["key"] for m in body["models"]} and body["series"]
    _login(client, "rnavarro")
    assert client.get("/api/model/summary").status_code == 403
    first = trained["forecast_dates"][0]
    r = client.get("/api/suggestions", params={"category": "BRASA", "start": first, "days": 2})
    assert r.status_code == 200, r.text
    assert r.json()["method"] == "modelo_entrenado"
    assert any(day["units"] for day in r.json()["days"])
    assert all("P0012" not in day["units"] for day in r.json()["days"])
    # El pollo sin menudencia tiene su propia sugerencia del modelo (solo con su producto).
    params = {"category": "Pollo de mercado", "start": first, "days": 2}
    r = client.get("/api/suggestions", params=params)
    assert r.status_code == 200, r.text
    assert r.json()["method"] == "modelo_entrenado"
    days = r.json()["days"]
    assert any(day["units"].get("P0012") for day in days)
    assert all(set(day["units"]) <= {"P0012"} for day in days)
    # Fuera de los días pronosticados, la sugerencia de siempre.
    later = str(START + timedelta(days=DAYS + 30))
    r = client.get("/api/suggestions", params={"category": "BRASA", "start": later, "days": 1})
    assert r.json()["method"] != "modelo_entrenado"


def test_without_history_there_is_nothing_to_train() -> None:
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
        assert training.train(session, SqlProductRepository(session).list_active()) is None


def test_a_new_seller_gets_the_general_suggestion(trained) -> None:
    """Sin pedidos propios en ARIS (un vendedor nuevo): el modelo para un vendedor típico en los
    días que pronostica, y los pedidos de un vendedor típico en los demás."""
    client = TestClient(app)
    _login(client, "gfernandez")
    first = trained["forecast_dates"][0]
    r = client.get("/api/suggestions", params={"category": "BRASA", "start": first, "days": 2})
    assert r.status_code == 200, r.text
    assert r.json()["method"] == "modelo_general"
    assert all(day["units"] for day in r.json()["days"])
    # El típico es el promedio del equipo: menos que el vendedor más grande.
    _login(client, "rnavarro")
    own = client.get("/api/suggestions", params={"category": "BRASA", "start": first, "days": 1})
    _login(client, "gfernandez")
    assert sum(r.json()["days"][0]["units"].values()) < sum(own.json()["days"][0]["units"].values())
    # Pasados los días pronosticados, el historial de un vendedor típico (no queda vacío).
    later = str(START + timedelta(days=DAYS + 5))
    r = client.get("/api/suggestions", params={"category": "BRASA", "start": later, "days": 1})
    assert r.json()["method"] == "historial_general"
    assert r.json()["days"][0]["units"]
