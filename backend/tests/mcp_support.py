"""Utilidades de las pruebas del servidor MCP (ADR 0017).

Las herramientas se llaman con el cliente oficial (`mcp.Client`) por el transporte real
(Streamable HTTP), contra la app de FastAPI en proceso: pasa por la autenticación, el
middleware de seguridad, el límite de llamadas y la auditoría, igual que en producción.
"""

import json
from datetime import timedelta
from typing import Any

import anyio
import httpx2
import pytest
from fastapi.testclient import TestClient
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from app.core.config import get_settings
from app.main import app, mcp_endpoint, mcp_server
from app.planning.infrastructure import cli
from app.planning.infrastructure.clock import ZoneClock
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine
from app.shared.infrastructure.mcp.limits import MemoryRateLimiter
from app.shared.infrastructure.mcp.server import AuditAndLimit

PASSWORD = "demo1234"
TODAY = ZoneClock(get_settings().tz).today()
AGENT_TOKEN = "token-de-servicio-del-agente-n8n-0123456789"
URL = "http://backend/mcp"
ACCEPT = {"Accept": "application/json, text/event-stream"}


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def limiter() -> AuditAndLimit:
    return next(m for m in mcp_server.middleware if isinstance(m, AuditAndLimit))


def fresh_mcp_db(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Base nueva con los usuarios de prueba, límite holgado y token de agente configurado
    (lo usa el fixture `mcp_db` de conftest.py)."""
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
    monkeypatch.setattr(limiter(), "limiter", MemoryRateLimiter(10_000, 60))
    monkeypatch.setattr(get_settings(), "mcp_agent_token", AGENT_TOKEN)
    return TestClient(app)


def token(client: TestClient, username: str, password: str = PASSWORD) -> str:
    r = client.post("/api/auth/token", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def login(username: str, password: str = PASSWORD) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return c


def submit(username: str, offset: int, units: dict[str, int], category: str = "BRASA") -> None:
    """Proyección registrada por la API HTTP (el mismo camino que la app)."""
    body = {"category": category, "days": [{"date": day(offset), "units": units}]}
    r = login(username).post("/api/projections", json=body)
    assert r.status_code == 201, r.text


def http_client(bearer: str | None) -> httpx2.AsyncClient:
    headers = {"Authorization": f"Bearer {bearer}"} if bearer is not None else {}
    return httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=app), base_url="http://backend", headers=headers
    )


async def _call(
    bearer: str, tool: str, args: dict[str, Any], ticket: str | None = None
) -> tuple[bool, str]:
    url = f"{URL}?ticket={ticket}" if ticket else URL
    async with (
        mcp_endpoint.lifespan(),
        http_client(bearer) as http,
        Client(streamable_http_client(url, http_client=http)) as client,
    ):
        result = await client.call_tool(tool, args)
    text = "".join(getattr(c, "text", "") for c in result.content)
    return bool(result.is_error), text


def call(
    bearer: str, tool: str, args: dict[str, Any] | None = None, ticket: str | None = None
) -> tuple[bool, str]:
    """(¿error?, texto) de una llamada a la herramienta (con `ticket`: un pase del asistente)."""
    return anyio.run(_call, bearer, tool, args or {}, ticket)


def ok(
    bearer: str, tool: str, args: dict[str, Any] | None = None, ticket: str | None = None
) -> dict[str, Any]:
    failed, text = call(bearer, tool, args, ticket)
    assert not failed, text
    return json.loads(text)


async def _list(bearer: str) -> list[Any]:
    async with (
        mcp_endpoint.lifespan(),
        http_client(bearer) as http,
        Client(streamable_http_client(URL, http_client=http)) as client,
    ):
        return (await client.list_tools()).tools


def list_tools(bearer: str) -> list[Any]:
    return anyio.run(_list, bearer)


async def _post(headers: dict[str, str], body: Any, path: str) -> httpx2.Response:
    async with mcp_endpoint.lifespan(), http_client(None) as http:
        return await http.post(path, json=body, headers={**ACCEPT, **headers})


def raw_post(
    headers: dict[str, str], body: Any | None = None, path: str = "/mcp"
) -> httpx2.Response:
    """Una petición JSON-RPC a mano (para probar la autenticación sin el cliente)."""
    default = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
    return anyio.run(_post, headers, default if body is None else body, path)
