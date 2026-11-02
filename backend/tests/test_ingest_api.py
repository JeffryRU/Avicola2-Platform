"""API de ingesta de punta a punta (contrato que usa n8n) sobre SQLite en memoria."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import engine


@pytest.fixture
def client(tmp_path, monkeypatch):
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    monkeypatch.setattr(get_settings(), "lakehouse_uri", str(tmp_path / "lakehouse"))
    monkeypatch.setattr(get_settings(), "ingest_api_token", None)
    return TestClient(app)


def _upload(client, path, **data):
    with path.open("rb") as fh:
        return client.post("/ingest/upload", files={"file": (path.name, fh)}, data=data)


def test_upload_loads_and_logs(client, sample) -> None:
    r = _upload(client, sample("Horeca_comercial1"))
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["rows_ok"] == 60
    assert body["bronze_path"].startswith("bronze/upload/")
    assert body["tables"]["orders"] == {"rows": 60, "version": 0}
    assert body["tables"]["gold.daily_demand"] == {"dates": 3, "version": 0}

    log = client.get("/ingest/log").json()
    assert [(e["id"], e["status"], e["rows_ok"]) for e in log] == [(body["log_id"], "ok", 60)]


def test_upload_rejects_unknown_table_and_empty_file(client, sample) -> None:
    r = _upload(client, sample("Horeca_comercial1"), table="nope")
    assert r.status_code == 422
    assert r.json()["detail"].startswith("tabla desconocida: nope")
    r = client.post("/ingest/upload", files={"file": ("x.csv", b"")})
    assert r.status_code == 422
    assert r.json() == {"detail": "archivo vacío"}


def test_mapping_flow_propose_confirm_reprocess(client, sample) -> None:
    first = _upload(client, sample("Horeca_horeca-wsp")).json()
    assert first["status"] == "needs_mapping"
    mapping_id = first["mapping_id"]
    [pending] = client.get("/ingest/mappings").json()
    assert pending["id"] == mapping_id and pending["proposed_by"] == "alias"

    bad = client.put(f"/ingest/mappings/{mapping_id}/proposal", json={"mapping": {"zzz": "x"}})
    assert (bad.status_code, bad.json()) == (422, {"detail": "columna desconocida: zzz"})

    proposal = {"Descripción": "product", "Peso neto (kg)": "qty_kg", "=type": "proyeccion"}
    r = client.put(f"/ingest/mappings/{mapping_id}/proposal", json={"mapping": proposal})
    assert r.status_code == 200
    assert r.json()["proposed_by"] == "llm"
    assert r.json()["mapping_json"]["peso_neto_kg"] == "qty_kg"

    r = client.post(f"/ingest/mappings/{mapping_id}/confirm")
    assert r.status_code == 200
    body = r.json()
    assert (body["mapping_id"], body["status"]) == (mapping_id, "confirmed")
    [result] = body["reprocessed"]
    assert result["status"] == "ok"
    assert result["signature"] == first["signature"]
    assert set(result["tables"]) == {"projections"}

    r = client.put(f"/ingest/mappings/{mapping_id}/proposal", json={"mapping": {}})
    assert (r.status_code, r.json()) == (409, {"detail": "el mapeo ya está confirmado"})


def test_mapping_not_found(client) -> None:
    r = client.post("/ingest/mappings/999/confirm")
    assert (r.status_code, r.json()) == (404, {"detail": "mapeo no encontrado"})


def test_transform_reprocesses_and_reports_missing_files(client, sample) -> None:
    uploaded = _upload(client, sample("Horeca_comercial1")).json()
    r = client.post("/ingest/transform", json={"bronze_path": uploaded["bronze_path"]})
    assert r.status_code == 200
    assert r.json()["tables"]["orders"]["version"] == 1

    r = client.post("/ingest/transform", json={"bronze_path": "bronze/x/none.xlsx"})
    assert (r.status_code, r.json()) == (404, {"detail": "no existe en bronze: bronze/x/none.xlsx"})


def test_service_token(client, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "ingest_api_token", "s3cret")
    r = client.get("/ingest/log")
    assert (r.status_code, r.json()) == (401, {"detail": "token de servicio inválido"})
    assert client.get("/ingest/log", headers={"X-Api-Token": "s3cret"}).status_code == 200
