"""Revisión adversarial del servidor MCP (ADR 0017): ataques y propiedades que deben cumplirse.

Cada test afirma el comportamiento CORRECTO. Los `test_fixed_*` fallaban al revisar el código
(4 hallazgos) y quedaron corregidos; los `test_holds_*` son ataques que ya resistían. Todos
quedan como regresión.
"""

import logging

import anyio
import pytest
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp_support import (
    ACCEPT,
    AGENT_TOKEN,
    URL,
    call,
    day,
    http_client,
    limiter,
    login,
    ok,
    raw_post,
    submit,
    token,
)

from app.main import mcp_endpoint, mcp_server
from app.shared.infrastructure.logging.formatters import JsonFormatter, TextFormatter
from app.shared.infrastructure.mcp.limits import MemoryRateLimiter, RedisRateLimiter
from app.shared.infrastructure.mcp.server import Identity, current_identity

pytestmark = pytest.mark.usefixtures("fast_hasher")


def _rpc_call(i: int, name: str, args: dict | None = None) -> dict:
    params = {"name": name, "arguments": args or {}}
    return {"jsonrpc": "2.0", "id": i, "method": "tools/call", "params": params}


def _audit(caplog) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == "app.mcp"]


# --- Corregido: inyección y desborde del registro de auditoría --------------------------------


FORGED = "\n2026-11-16 09:00:00,000 INFO     [abc] app.mcp: MCP stock de general → ok"


def test_fixed_tool_name_cannot_forge_audit_lines(mcp_db, caplog) -> None:
    """Corregido: el nombre de la herramienta llega sin sanear al log de texto (formato por
    defecto, LOG_FORMAT=text): un usuario autenticado inserta líneas de auditoría falsas."""
    caplog.set_level(logging.INFO, logger="app.mcp")
    t = token(mcp_db, "rnavarro")
    raw_post({"Authorization": f"Bearer {t}"}, _rpc_call(1, "stock" + FORGED))
    [record] = _audit(caplog)
    line = TextFormatter().format(record)
    assert "\n" not in line, line


def test_fixed_tool_name_length_is_bounded_in_the_audit(mcp_db, caplog) -> None:
    """Corregido: `mcp_tool` no se recorta (los argumentos sí, a 60): un nombre de ~3 MB va entero
    al log en cada llamada (y al mensaje de error de vuelta). 30 llamadas/min ≈ 90 MB/min por
    usuario: con LOG_MAX_MB=10 y 5 respaldos, la rotación borra la auditoría real en minutos."""
    caplog.set_level(logging.INFO, logger="app.mcp")
    t = token(mcp_db, "rnavarro")
    huge = "a" * 3_000_000
    r = raw_post({"Authorization": f"Bearer {t}"}, _rpc_call(1, huge))
    assert r.status_code == 200
    [record] = _audit(caplog)
    assert len(record.mcp_tool) <= 100, len(record.mcp_tool)
    assert len(JsonFormatter().format(record)) < 10_000


# --- Corregido: confirmación del equipo agrupa por nombre visible --------------------------------


def test_fixed_team_confirmation_counts_people_not_names(mcp_db) -> None:
    """Corregido: `confirmacion_del_equipo` agrupa por (nombre, zona) de la tabla de exportación, no
    por usuario. Dos vendedores con el mismo nombre y zona se cuentan como uno: «vendedores»
    y «registraron» salen mal y las unidades de ambos se suman en una sola persona."""
    sup = login("supervisor")
    body = {
        "username": "rnavarro2",
        "name": "Roberto Navarro",
        "zone": "Trujillo",
        "role": "seller",
    }
    r = sup.post("/api/admin/accounts", json=body)
    assert r.status_code == 201, r.text
    temp = r.json()["temporary_password"]
    submit("rnavarro", 1, {"P0001": 10})
    c = login("rnavarro2", temp)
    r = c.post(
        "/api/projections",
        json={"category": "BRASA", "days": [{"date": day(1), "units": {"P0001": 5}}]},
    )
    assert r.status_code == 201, r.text
    t = token(mcp_db, "supervisor")
    team = ok(t, "confirmacion_del_equipo", {"fecha": day(1)})
    assert team["registraron"] == 2, team
    assert team["vendedores"] == 8, team
    assert sorted(p["unidades"] for p in team["con_proyeccion"]) == [5, 10], team


# --- Defensas que resisten ---------------------------------------------------------------


def test_holds_concurrent_calls_never_mix_identities(mcp_db, monkeypatch) -> None:
    """80 llamadas concurrentes de 4 usuarios, con la herramienta cediendo el control a mitad
    de camino: la identidad (contextvar del SDK) nunca pasa de una petición a otra. Sin base
    de datos (SQLite en memoria no admite hilos concurrentes): verificador y herramienta falsos."""
    users = {f"tok-{u}": Identity(u, "seller", frozenset()) for u in "abcd"}
    monkeypatch.setattr(mcp_server._token_verifier, "identify", users.get)

    async def quien_soy(espera: float = 0) -> str:
        before = current_identity().username
        await anyio.sleep(espera)
        return f"{before}/{current_identity().username}"

    # Se quita en el `finally` de abajo: las demás pruebas ven solo las herramientas reales.
    mcp_server.add_tool(quien_soy, name="quien_soy", structured_output=False)
    results: list[tuple[str, str]] = []

    async def one(i: int, bearer: str) -> None:
        async with (
            http_client(bearer) as http,
            Client(streamable_http_client(URL, http_client=http)) as client,
        ):
            res = await client.call_tool("quien_soy", {"espera": (i % 5) / 100})
        results.append((users[bearer].username, res.content[0].text))

    async def main() -> None:
        async with mcp_endpoint.lifespan(), anyio.create_task_group() as tg:
            for i in range(80):
                tg.start_soon(one, i, list(users)[i % 4])

    try:
        anyio.run(main)
    finally:
        mcp_server._tool_manager._tools.pop("quien_soy", None)
    assert len(results) == 80
    assert all(seen == f"{who}/{who}" for who, seen in results), results


def test_holds_role_change_takes_effect_on_old_token(mcp_db) -> None:
    """Un supervisor degradado a vendedor deja de ver al equipo con su token viejo."""
    old = token(mcp_db, "supervisor")
    assert len(ok(old, "listar_vendedores")["vendedores"]) == 7
    r = login("general").put("/api/admin/accounts/supervisor/role", json={"role": "seller"})
    assert r.status_code == 200, r.text
    status = raw_post({"Authorization": f"Bearer {old}"}).status_code
    if status == 200:
        assert [v["usuario"] for v in ok(old, "listar_vendedores")["vendedores"]] == ["supervisor"]
        failed, text = call(old, "saca_sugerida", {"fecha": day(0)})
        assert failed and "saca" in text
    else:
        assert status == 401


@pytest.mark.parametrize(
    "header",
    [
        "Bearer\t{t}",
        "Bearer  {t}",
        "Bearer {t}x",
        "Token {t}",
        "Bearer " + AGENT_TOKEN.upper(),
        "Bearer " + AGENT_TOKEN[:-1],
        "Bearer " + AGENT_TOKEN + " ",
    ],
)
def test_holds_header_tricks_are_401(mcp_db, header) -> None:
    t = token(mcp_db, "supervisor")
    assert raw_post({"Authorization": header.format(t=t)}).status_code == 401


@pytest.mark.parametrize("suffix", ["é", "\u0000", "\u200b"])
def test_holds_non_ascii_bytes_after_agent_token_are_401(mcp_db, suffix) -> None:
    """Bytes no ASCII en la cabecera (el servidor la decodifica como latin-1): sin 500."""
    raw = ("Bearer " + AGENT_TOKEN + suffix).encode("utf-8")

    async def go() -> int:
        async with mcp_endpoint.lifespan(), http_client(None) as http:
            body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
            r = await http.post("/mcp", json=body, headers={**ACCEPT, "Authorization": raw})
            return r.status_code

    assert anyio.run(go) == 401


def test_fixed_database_failure_during_auth_is_not_a_500(mcp_db, monkeypatch) -> None:
    """Corregido (bajo): si la base falla al verificar el token (caída, pool agotado), la excepción
    sale de `BearerVerifier.verify_token` sin capturar y el cliente recibe HTTP 500. La
    especificación pide no responder nunca 500 al agente (un 503 o un error JSON-RPC sí)."""
    from sqlalchemy.exc import OperationalError

    def broken(_: str) -> None:
        cause = Exception("connection refused db.internal:5432")
        raise OperationalError("SELECT ...", {}, cause)

    monkeypatch.setattr(mcp_server._token_verifier, "identify", broken)
    r = raw_post({"Authorization": "Bearer cualquiera"})
    assert "db.internal" not in r.text and "SELECT" not in r.text
    assert r.status_code != 500, (r.status_code, r.text)


def test_holds_agent_token_rejected_when_config_is_whitespace_or_empty(mcp_db, monkeypatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "mcp_agent_token", "")
    assert raw_post({"Authorization": "Bearer "}).status_code == 401
    assert raw_post({"Authorization": "Bearer  "}).status_code == 401


def test_holds_agent_token_does_not_work_as_session_cookie(mcp_db) -> None:
    mcp_db.cookies.set("nv_session", AGENT_TOKEN, path="/api")
    assert mcp_db.get("/api/auth/me").status_code == 401
    r = mcp_db.get("/api/saca", params={"date": day(0)})
    assert r.status_code == 401


def test_holds_jsonrpc_batch_is_rejected(mcp_db, monkeypatch, caplog) -> None:
    """Un arreglo JSON-RPC no se procesa: no hay forma de saltarse el límite en lote."""
    caplog.set_level(logging.INFO, logger="app.mcp")
    monkeypatch.setattr(limiter(), "limiter", MemoryRateLimiter(1, 60))
    t = token(mcp_db, "supervisor")
    batch = [_rpc_call(i, "listar_vendedores") for i in range(5)]
    r = raw_post({"Authorization": f"Bearer {t}"}, batch)
    assert r.status_code == 400 and "vendedores" not in r.text
    assert _audit(caplog) == []


def test_holds_tools_call_as_notification_runs_nothing(mcp_db, caplog) -> None:
    caplog.set_level(logging.INFO, logger="app.mcp")
    t = token(mcp_db, "supervisor")
    body = _rpc_call(0, "listar_vendedores")
    del body["id"]
    r = raw_post({"Authorization": f"Bearer {t}"}, body)
    assert r.status_code == 202 and r.text == ""
    assert _audit(caplog) == []


def test_holds_modern_protocol_path_is_limited_and_audited(mcp_db, monkeypatch, caplog) -> None:
    """El SDK 2.x sirve el protocolo 2026-07-28 por otra ruta (sin initialize): también pasa
    por la autenticación, el límite y la auditoría."""
    caplog.set_level(logging.INFO, logger="app.mcp")
    monkeypatch.setattr(limiter(), "limiter", MemoryRateLimiter(2, 60))
    t = token(mcp_db, "supervisor")
    meta = {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": {"name": "x", "version": "1"},
        "io.modelcontextprotocol/clientCapabilities": {},
    }
    headers = {
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "tools/call",
        "mcp-name": "listar_vendedores",
    }
    assert raw_post(headers, _rpc_call(1, "listar_vendedores")).status_code == 401
    texts = []
    for i in range(3):
        body = _rpc_call(i, "listar_vendedores")
        body["params"]["_meta"] = meta
        r = raw_post({**headers, "Authorization": f"Bearer {t}"}, body)
        texts.append(r.text)
    assert "Demasiadas consultas" in texts[2]
    assert [x.mcp_result for x in _audit(caplog)] == ["ok", "ok", "rate_limited"]


def test_holds_invalid_params_are_audited_and_counted(mcp_db, monkeypatch, caplog) -> None:
    caplog.set_level(logging.INFO, logger="app.mcp")
    monkeypatch.setattr(limiter(), "limiter", MemoryRateLimiter(2, 60))
    t = token(mcp_db, "supervisor")
    for params in ({}, {"name": 5}):
        body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": params}
        raw_post({"Authorization": f"Bearer {t}"}, body)
    failed, text = call(t, "listar_vendedores")
    assert failed and "Demasiadas consultas" in text
    assert [x.mcp_result for x in _audit(caplog)] == ["rejected", "rejected", "rate_limited"]


def test_holds_redis_failure_still_limits(monkeypatch) -> None:
    class Broken:
        def pipeline(self):
            raise ConnectionError("redis caído")

    rl = RedisRateLimiter(Broken(), 2, 60, "t:")
    assert [rl.allow("u") for _ in range(3)] == [True, True, False]
    assert rl.allow("otro") is True


def test_holds_token_never_logged_even_on_errors(mcp_db, caplog) -> None:
    caplog.set_level(logging.DEBUG)
    t = token(mcp_db, "supervisor")
    call(t, "saca_sugerida", {"fecha": "no"})
    call(t, "no_existe")
    call(AGENT_TOKEN, "proyecciones", {"fecha_desde": day(3), "fecha_hasta": day(0)})
    raw_post({"Authorization": f"Bearer {t}"}, _rpc_call(1, "listar_vendedores", {"x": t}))
    text = "\n".join(TextFormatter().format(r) for r in caplog.records)
    assert AGENT_TOKEN not in text
    # El único sitio donde aparece el token es el argumento que el propio cliente envió (y se
    # recorta a 60 caracteres).
    assert t not in text


def test_holds_seller_filter_has_no_wildcards(mcp_db) -> None:
    submit("rnavarro", 1, {"P0001": 10})
    t = token(mcp_db, "supervisor")
    for pattern in ("%", "r%", "*", "rnavarro' OR '1'='1"):
        body = ok(
            t, "proyecciones", {"fecha_desde": day(0), "fecha_hasta": day(2), "vendedor": pattern}
        )
        assert body["proyecciones"] == [], pattern


def test_holds_get_and_trailing_slash_do_not_reach_tools(mcp_db) -> None:
    t = token(mcp_db, "supervisor")

    async def go() -> list[int]:
        async with mcp_endpoint.lifespan(), http_client(t) as http:
            out = []
            for method, path in (("GET", "/mcp"), ("POST", "/mcp/"), ("POST", "/MCP")):
                with anyio.fail_after(5):
                    r = await http.request(
                        method, path, json=_rpc_call(1, "listar_vendedores"), headers=ACCEPT
                    )
                assert "vendedores" not in r.text
                out.append(r.status_code)
            return out

    assert all(400 <= s < 500 for s in anyio.run(go))
