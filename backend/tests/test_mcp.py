"""Servidor MCP para agentes de IA (ADR 0017), por el transporte real y con cada rol.

Casos de la especificación (tarea 0006): cada herramienta responde con datos reales, un
vendedor nunca ve datos de otro, sin token o con uno inválido es 401, el agente de servicio
solo lee, hay límite de llamadas por usuario y cada llamada queda en la auditoría.
"""

import logging

import pytest
from mcp_support import (
    AGENT_TOKEN,
    TODAY,
    call,
    day,
    limiter,
    list_tools,
    login,
    ok,
    raw_post,
    submit,
    token,
)

from app.ingest.domain.models import IngestStatus, LogEntry
from app.ingest.infrastructure.persistence.repository import SqlIngestRepository
from app.shared.infrastructure.database.session import SessionLocal
from app.shared.infrastructure.mcp.limits import MemoryRateLimiter

pytestmark = pytest.mark.usefixtures("fast_hasher")

TOOLS = {
    "listar_vendedores",
    "proyecciones",
    "confirmacion_del_equipo",
    "saca_sugerida",
    "stock",
    "produccion",
    "cargas_de_archivos",
    "reglas_de_registro",
    "productos",
    "pedido_real",
}
STOCK_LINES = [{"product_id": "P0001", "units": 120}, {"product_id": "P0006", "units": 40}]
PRODUCTION_LINES = [{"product_id": "P0003", "ordered": 4050, "produced": 1174, "quality_b": 120}]


@pytest.fixture
def tokens(mcp_db):
    return {u: token(mcp_db, u) for u in ("rnavarro", "hdias", "supervisor", "despacho")}


def _log_load(status: IngestStatus, name: str, errors: list | None = None) -> None:
    rows_ok = 0 if status == IngestStatus.FAILED else 5
    entry = LogEntry(name, "inbox", status, rows_ok, 1, errors or [], None, None, {})
    with SessionLocal() as session:
        SqlIngestRepository(session).log(entry)


# --- Contrato: herramientas de solo lectura ---------------------------------------------


def test_lists_only_read_only_tools_with_spanish_descriptions(tokens) -> None:
    tools = list_tools(tokens["rnavarro"])
    assert {t.name for t in tools} == TOOLS
    for tool in tools:
        assert tool.annotations.read_only_hint is True, tool.name
        assert tool.annotations.destructive_hint is False, tool.name
        assert len(tool.description) > 60, tool.name
    params = {t.name: set(t.input_schema.get("properties", {})) for t in tools}
    assert params["proyecciones"] == {"fecha_desde", "fecha_hasta", "vendedor"}
    assert params["saca_sugerida"] == {"fecha"}


# --- Autenticación ----------------------------------------------------------------------


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer "},
        {"Authorization": "Bearer no-es-un-token"},
        {"Authorization": "Basic cnVhdmFycm86ZGVtbzEyMzQ="},
        {"Authorization": "bearer"},
        {"X-Api-Token": "x"},
    ],
)
def test_missing_or_invalid_token_is_401(mcp_db, headers) -> None:
    r = raw_post(headers)
    assert r.status_code == 401, r.text
    assert r.headers["www-authenticate"].startswith("Bearer")


def test_session_cookie_is_not_enough(mcp_db) -> None:
    """El MCP no acepta la cookie del navegador: solo Bearer (sin CSRF posible)."""
    cookie = login("supervisor").cookies.get("nv_session")
    assert raw_post({"Cookie": f"nv_session={cookie}"}).status_code == 401


def test_old_token_stops_working_after_password_change(mcp_db) -> None:
    old = token(mcp_db, "rnavarro")
    c = login("rnavarro")
    r = c.post(
        "/api/auth/password",
        json={"current_password": "demo1234", "new_password": "Pollo-fresco-2026"},
    )
    assert r.status_code == 200, r.text
    assert raw_post({"Authorization": f"Bearer {old}"}).status_code == 401


def test_deactivated_account_is_401(tokens) -> None:
    r = login("supervisor").patch("/api/admin/accounts/rnavarro", json={"active": False})
    assert r.status_code == 200, r.text
    assert raw_post({"Authorization": f"Bearer {tokens['rnavarro']}"}).status_code == 401


def test_agent_token_only_when_configured(mcp_db, monkeypatch) -> None:
    from app.core.config import get_settings

    assert raw_post({"Authorization": f"Bearer {AGENT_TOKEN}"}).status_code == 200
    monkeypatch.setattr(get_settings(), "mcp_agent_token", None)
    assert raw_post({"Authorization": f"Bearer {AGENT_TOKEN}"}).status_code == 401
    # Vacío no es «cualquier token vacío vale».
    monkeypatch.setattr(get_settings(), "mcp_agent_token", "")
    assert raw_post({"Authorization": "Bearer "}).status_code == 401


def test_agent_token_does_not_open_the_http_api(mcp_db) -> None:
    """El token del agente solo sirve en /mcp: la API (y sus escrituras) no lo aceptan."""
    headers = {"Authorization": f"Bearer {AGENT_TOKEN}"}
    assert mcp_db.get("/api/auth/me", headers=headers).status_code == 401
    body = {"category": "BRASA", "seller": "rnavarro", "days": [{"date": day(1), "units": {}}]}
    assert mcp_db.post("/api/projections", json=body, headers=headers).status_code == 401


# --- Permisos: un vendedor no ve datos de otro ------------------------------------------


def test_seller_sees_only_own_projections(tokens) -> None:
    submit("rnavarro", 1, {"P0001": 10})
    submit("hdias", 1, {"P0001": 7, "P0010": 2})
    for asked in (None, "hdias", "supervisor", "nadie"):
        args = {"fecha_desde": day(0), "fecha_hasta": day(3)}
        if asked:
            args["vendedor"] = asked
        body = ok(tokens["rnavarro"], "proyecciones", args)
        assert {p["vendedor"] for p in body["proyecciones"]} == {"rnavarro"}, asked
        assert body["unidades_total"] == 10


def test_supervisor_sees_the_team_or_one_seller(tokens) -> None:
    submit("rnavarro", 1, {"P0001": 10})
    submit("hdias", 1, {"P0001": 7, "P0010": 2})
    args = {"fecha_desde": day(0), "fecha_hasta": day(3)}
    everyone = ok(tokens["supervisor"], "proyecciones", args)
    assert {p["vendedor"] for p in everyone["proyecciones"]} == {"rnavarro", "hdias"}
    assert everyone["unidades_total"] == 19
    one = ok(tokens["supervisor"], "proyecciones", {**args, "vendedor": "hdias"})
    [row] = one["proyecciones"]
    assert row["fecha"] == day(1) and row["unidades_total"] == 9
    assert all(n > 0 for n in row["unidades_por_producto"].values())
    assert any("(P0010)" in name for name in row["unidades_por_producto"])


def test_seller_only_sees_himself_in_lists(tokens) -> None:
    submit("hdias", 0, {"P0001": 3})
    sellers = ok(tokens["rnavarro"], "listar_vendedores")["vendedores"]
    assert [s["usuario"] for s in sellers] == ["rnavarro"]
    team = ok(tokens["rnavarro"], "confirmacion_del_equipo", {"fecha": day(0)})
    assert team["vendedores"] == 1 and team["registraron"] == 0
    assert team["sin_proyeccion"] == [
        {"usuario": "rnavarro", "vendedor": "Roberto Navarro", "zona": "Trujillo"}
    ]


def test_team_confirmation_for_a_day(tokens) -> None:
    submit("rnavarro", 1, {"P0001": 10, "P0002": 4})
    team = ok(tokens["supervisor"], "confirmacion_del_equipo", {"fecha": day(1)})
    assert team["vendedores"] == 7 and team["registraron"] == 1
    [done] = team["con_proyeccion"]
    assert done["usuario"] == "rnavarro" and done["unidades"] == 14
    assert done["categorias"] == ["BRASA"]
    assert "hdias" in {p["usuario"] for p in team["sin_proyeccion"]}


@pytest.mark.parametrize(
    ("user", "tool", "args", "message"),
    [
        ("rnavarro", "saca_sugerida", {"fecha": day(0)}, "ver el cálculo de saca"),
        ("rnavarro", "stock", {"fecha_desde": day(-3), "fecha_hasta": day(0)}, "ver el stock"),
        ("rnavarro", "produccion", {"fecha_desde": day(-3), "fecha_hasta": day(0)}, "producción"),
        ("rnavarro", "cargas_de_archivos", {}, "cargas de archivos"),
        ("despacho", "saca_sugerida", {"fecha": day(0)}, "ver el cálculo de saca"),
        ("despacho", "cargas_de_archivos", {}, "cargas de archivos"),
    ],
)
def test_role_without_permission_gets_a_clear_error(tokens, user, tool, args, message) -> None:
    failed, text = call(tokens[user], tool, args)
    assert failed and message in text, text


# --- Cada herramienta, con datos reales ---------------------------------------------------


def test_saca_uses_the_same_use_case_as_the_api(tokens) -> None:
    submit("rnavarro", 2, {"P0001": 10})
    via_api = login("supervisor").get("/api/saca", params={"date": day(0)}).json()
    saca = ok(tokens["supervisor"], "saca_sugerida", {"fecha": day(0)})
    assert saca["pedido_a_granja_aves"] == via_api["farm_order"]
    assert saca["proyeccion_del"] == day(2) and saca["pedidos_del"] == day(1)
    assert saca["vendedores_con_proyeccion"] == via_api["sellers_registered"] == 1
    assert saca["stock_productos"] == via_api["stock"] and saca["plus_total"] == via_api["plus"]
    assert [g["pedido_a_granja"] for g in saca["por_tipo"]] == [
        g["farm_order"] for g in via_api["groups"]
    ]


def test_stock_and_production(tokens) -> None:
    chief = login("despacho")
    assert chief.put(f"/api/stock/{TODAY}", json={"lines": STOCK_LINES}).status_code == 200
    r = chief.put(f"/api/production/{TODAY}", json={"lines": PRODUCTION_LINES})
    assert r.status_code == 200, r.text
    span = {"fecha_desde": day(-7), "fecha_hasta": day(0)}
    for user in ("supervisor", "despacho"):
        [stock_day] = ok(tokens[user], "stock", span)["dias"]
        assert stock_day["fecha"] == day(0) and stock_day["unidades_total"] == 160
        assert {line["unidades"] for line in stock_day["lineas"]} == {120, 40}
        [prod] = ok(tokens[user], "produccion", span)["dias"]
        assert prod["aves_llegadas"] == 1174 and prod["calidad_b"] == 120


def test_empty_range_says_there_is_no_data(tokens) -> None:
    span = {"fecha_desde": day(-30), "fecha_hasta": day(-20)}
    assert ok(tokens["supervisor"], "stock", span) == {
        "desde": day(-30),
        "hasta": day(-20),
        "dias": [],
        "cantidad": 0,
    }
    body = ok(tokens["supervisor"], "proyecciones", span)
    assert body["proyecciones"] == [] and body["cantidad"] == 0


def test_failed_loads(tokens) -> None:
    _log_load(IngestStatus.OK, "ventas.xlsx")
    _log_load(IngestStatus.FAILED, "pedidos.xlsx", [{"row": 2, "error": "fecha inválida"}])
    body = ok(tokens["supervisor"], "cargas_de_archivos", {"estado": "failed"})
    [load] = body["cargas"]
    assert load["archivo"] == "pedidos.xlsx" and load["estado"] == "failed"
    assert load["cargada_el"].startswith(TODAY.isoformat())
    assert "fecha inválida" in load["primeros_errores"][0]
    assert ok(tokens["supervisor"], "cargas_de_archivos", {"limite": 5})["cantidad"] == 2


def test_domain_errors_reach_the_agent_as_text(tokens) -> None:
    failed, text = call(
        tokens["supervisor"], "proyecciones", {"fecha_desde": day(3), "fecha_hasta": day(0)}
    )
    assert failed and "El rango de fechas está invertido." in text
    failed, text = call(tokens["supervisor"], "saca_sugerida", {"fecha": "mañana"})
    assert failed and "fecha" in text


# --- Agente de servicio (n8n) ------------------------------------------------------------


def test_agent_reads_like_a_supervisor(tokens) -> None:
    submit("rnavarro", 1, {"P0001": 10})
    submit("hdias", 1, {"P0001": 7})
    args = {"fecha_desde": day(0), "fecha_hasta": day(3)}
    assert ok(AGENT_TOKEN, "proyecciones", args) == ok(tokens["supervisor"], "proyecciones", args)
    assert len(ok(AGENT_TOKEN, "listar_vendedores")["vendedores"]) == 7
    assert not call(AGENT_TOKEN, "saca_sugerida", {"fecha": day(0)})[0]
    assert not call(AGENT_TOKEN, "cargas_de_archivos")[0]
    assert {t.name for t in list_tools(AGENT_TOKEN)} == TOOLS


# --- Límite de llamadas y auditoría -------------------------------------------------------


def test_rate_limit_per_user(tokens, monkeypatch) -> None:
    monkeypatch.setattr(limiter(), "limiter", MemoryRateLimiter(3, 60))
    for _ in range(3):
        assert not call(tokens["supervisor"], "listar_vendedores")[0]
    failed, text = call(tokens["supervisor"], "listar_vendedores")
    assert failed and "Demasiadas consultas" in text
    # Otro usuario tiene su propio contador.
    assert not call(tokens["rnavarro"], "listar_vendedores")[0]


def test_rate_limit_counts_invalid_calls_too(tokens, monkeypatch) -> None:
    monkeypatch.setattr(limiter(), "limiter", MemoryRateLimiter(2, 60))
    call(tokens["supervisor"], "saca_sugerida", {"fecha": "no"})
    call(tokens["supervisor"], "no_existe", {})
    failed, text = call(tokens["supervisor"], "saca_sugerida", {"fecha": day(0)})
    assert failed and "Demasiadas consultas" in text


def test_every_call_is_audited(tokens, caplog) -> None:
    caplog.set_level(logging.INFO, logger="app.mcp")
    ok(tokens["supervisor"], "proyecciones", {"fecha_desde": day(0), "fecha_hasta": day(1)})
    call(tokens["rnavarro"], "saca_sugerida", {"fecha": day(0)})
    records = [r for r in caplog.records if r.name == "app.mcp"]
    assert [(r.mcp_user, r.mcp_tool, r.mcp_result) for r in records] == [
        ("supervisor", "proyecciones", "ok"),
        ("rnavarro", "saca_sugerida", "error"),
    ]
    assert records[0].mcp_args == {"fecha_desde": day(0), "fecha_hasta": day(1)}
    assert records[0].mcp_role == "supervisor" and records[0].mcp_size > 0
    assert "permiso" in records[1].mcp_error
    # El token nunca queda en el registro.
    assert all(tokens["supervisor"] not in r.getMessage() + str(vars(r)) for r in records)


def test_audit_trims_long_arguments(tokens, caplog) -> None:
    caplog.set_level(logging.INFO, logger="app.mcp")
    call(tokens["supervisor"], "proyecciones", {"fecha_desde": "x" * 5000, "fecha_hasta": day(0)})
    [record] = [r for r in caplog.records if r.name == "app.mcp"]
    assert len(record.mcp_args["fecha_desde"]) <= 60
    assert record.mcp_result == "error"


def test_get_is_not_an_open_stream(mcp_db) -> None:
    """Sin estado no hay SSE: un GET responde 405 en vez de dejar la conexión abierta."""
    import anyio
    from mcp_support import http_client

    async def get():
        async with http_client(AGENT_TOKEN) as http:
            return await http.get("/mcp", headers={"Accept": "text/event-stream"})

    r = anyio.run(get)
    assert r.status_code == 405 and r.headers["allow"] == "POST"


@pytest.mark.parametrize(
    "weak",
    ["corto", " " * 40, "a" * 40, "ab" * 20, "secreto-de-tests-con-largo-suficiente"],
)
def test_weak_agent_token_blocks_startup_outside_local(weak) -> None:
    from app.core.config import Settings

    settings = Settings(app_env="production", mcp_agent_token=weak)
    assert any("MCP_AGENT_TOKEN" in p for p in settings.security_problems())
    strong = Settings(app_env="production", mcp_agent_token="0123456789abcdef" * 4)
    assert not any("MCP_AGENT_TOKEN" in p for p in strong.security_problems())
