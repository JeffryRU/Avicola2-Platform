"""Logs: archivos app.log/errors.log, id de petición, errores 500 y que no se filtren secretos."""

import json
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.shared.domain.errors import AuthenticationError
from app.shared.infrastructure.http.errors import register_error_handlers
from app.shared.infrastructure.logging.middleware import HEADER, install_request_logging
from app.shared.infrastructure.logging.setup import ERROR_LOG, configure_logging


@pytest.fixture
def log_dir(tmp_path):
    configure_logging("INFO", "text", tmp_path)
    yield tmp_path
    configure_logging("INFO", "text", None)  # suelta los archivos (Windows los bloquea)


def _read(path) -> str:
    for handler in logging.getLogger().handlers:
        handler.flush()
    return path.read_text(encoding="utf-8") if path.exists() else ""


def _app() -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)
    install_request_logging(app)

    @app.get("/api/ok")
    def ok() -> dict[str, str]:
        logging.getLogger("app.test").info("dentro de la petición")
        return {"status": "ok"}

    @app.get("/api/boom")
    def boom() -> None:
        raise RuntimeError("falla inesperada")

    @app.get("/api/denied")
    def denied() -> None:
        raise AuthenticationError("Sesión inválida o vencida.")

    @app.post("/api/login")
    def login(body: dict[str, int]) -> None: ...

    return app


def test_writes_app_log_with_request_id(log_dir):
    r = TestClient(_app()).get("/api/ok", headers={HEADER: "n8n-run-42"})
    assert r.headers[HEADER] == "n8n-run-42"
    text = _read(log_dir / "app.log")
    assert "[n8n-run-42] app.test: dentro de la petición" in text
    assert "GET /api/ok → 200 | duration_ms=" in text
    assert _read(log_dir / ERROR_LOG) == ""


def test_unhandled_error_goes_to_errors_log_with_traceback(log_dir):
    r = TestClient(_app(), raise_server_exceptions=False).get("/api/boom")
    assert r.status_code == 500
    rid = r.json()["request_id"]
    assert r.json()["detail"] == "Error interno del servidor."
    assert "falla inesperada" not in r.text  # el detalle queda en el log, no en la respuesta
    errors = _read(log_dir / ERROR_LOG)
    assert f"[{rid}]" in errors and "Traceback" in errors and "RuntimeError" in errors


def test_expected_errors_stay_out_of_errors_log(log_dir):
    client = TestClient(_app())
    assert client.get("/api/denied").status_code == 401
    assert client.post("/api/login", json={"password": "secreto-123"}).status_code == 422
    text = _read(log_dir / "app.log")
    assert "Rechazado (AuthenticationError)" in text
    assert "Petición inválida" in text
    assert "secreto-123" not in text  # el valor del formulario nunca se registra
    assert _read(log_dir / ERROR_LOG) == ""


def test_rejects_unsafe_request_id(log_dir):
    r = TestClient(_app()).get("/api/ok", headers={HEADER: "x\ny falso"})
    assert r.headers[HEADER] != "x\ny falso" and len(r.headers[HEADER]) == 12


def test_json_format(tmp_path):
    configure_logging("INFO", "json", tmp_path)
    try:
        logging.getLogger("app.test").warning("hola", extra={"rows": 3})
        entry = json.loads(_read(tmp_path / "app.log").splitlines()[-1])
    finally:
        configure_logging("INFO", "text", None)
    assert entry | {"time": None} == {
        "time": None,
        "level": "WARNING",
        "logger": "app.test",
        "request_id": "-",
        "message": "hola",
        "rows": 3,
    }


def test_reconfiguring_does_not_duplicate_handlers(tmp_path):
    before = len(logging.getLogger().handlers)
    configure_logging("INFO", "text", tmp_path)
    configure_logging("INFO", "text", tmp_path)
    assert len(logging.getLogger().handlers) <= before + 3
    configure_logging("INFO", "text", None)


def test_unknown_format_fails_fast():
    with pytest.raises(ValueError, match="LOG_FORMAT"):
        configure_logging("INFO", "xml", None)


def test_unwritable_log_dir_falls_back_to_console(tmp_path, caplog):
    blocked = tmp_path / "archivo"
    blocked.write_text("no es una carpeta")
    configure_logging("INFO", "text", blocked / "logs")  # no debe tumbar la API
    assert "solo consola" in caplog.text
    configure_logging("INFO", "text", None)


def _client_app() -> TestClient:
    from app.shared.infrastructure.logging import client

    client._limit = client._RateLimit(client.MAX_ENTRIES_PER_MINUTE)
    app = FastAPI()
    install_request_logging(app)
    app.include_router(client.router)
    return TestClient(app)


def test_client_errors_go_to_frontend_log_only(log_dir):
    r = _client_app().post(
        "/api/client-logs",
        json={
            "entries": [
                {
                    "kind": "react",
                    "message": "No se pudo leer 'units'\nFALSO 2026 ERROR",
                    "stack": "TypeError: x\n    at Matrix (matrix.tsx:10)",
                    "route": "/registrar",
                    "user": "rnavarro",
                    "request_id": "a1b2c3d4e5f6",
                }
            ]
        },
    )
    assert r.status_code == 204
    front = _read(log_dir / "frontend.log")
    assert "api_request_id=a1b2c3d4e5f6" in front  # enlaza con la línea del backend
    assert "react en /registrar: No se pudo leer 'units' FALSO 2026 ERROR" in front
    assert "user=rnavarro" in front and "\n        at Matrix (matrix.tsx:10)" in front
    assert "No se pudo leer" not in _read(log_dir / "app.log")
    assert _read(log_dir / ERROR_LOG) == ""  # errors.log es solo del backend


def test_client_logs_are_validated_and_rate_limited(log_dir):
    client = _client_app()
    assert client.post("/api/client-logs", json={"entries": []}).status_code == 422
    bad_user = {"entries": [{"message": "x", "user": "a b\nc"}]}
    assert client.post("/api/client-logs", json=bad_user).status_code == 422
    batch = {"entries": [{"message": f"error {i}"} for i in range(20)]}
    assert client.post("/api/client-logs", json=batch).status_code == 204
    assert client.post("/api/client-logs", json=batch).status_code == 204
    front = _read(log_dir / "frontend.log")
    assert front.count("error en ?: error") == 30
    assert "10 reportes descartados" in _read(log_dir / "app.log")
