"""Propiedades del servidor MCP con Hypothesis (ADR 0017), contra oráculos de la especificación.

Los oráculos se escriben desde la tarea 0006 y el ADR 0010, sin usar `permissions.py`:

- un vendedor solo ve sus proyecciones, pida lo que pida; el supervisor, el supervisor general
  y el agente de servicio ven las de todos (o las del vendedor que filtren); el jefe de despacho
  no proyecta ni ve al equipo;
- quién puede usar cada herramienta (tabla `ACCESS`).

`test_tools_never_crash` (marca `fuzz`) envía argumentos aleatorios a cada herramienta por el
transporte real: nunca un fallo interno, siempre una respuesta o un error legible.
"""

import json
import string

import pytest
from conftest import examples
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from mcp_support import AGENT_TOKEN, call, day, list_tools, submit, token

pytestmark = pytest.mark.usefixtures("fast_hasher")

SELLERS = ("rnavarro", "hdias", "mcordova")
AGENT = "agente"
ACTORS = (*SELLERS, "supervisor", "general", "despacho", AGENT)
# Proyecciones de prueba: (vendedor, día desde hoy) → unidades de Brasa 1.
SUBMITTED = {("rnavarro", 1): 10, ("hdias", 1): 7, ("hdias", 2): 5, ("mcordova", 2): 3}

# Especificación: quién usa cada herramienta (ADR 0010, tarea 0006).
TEAM = {"supervisor", "general", AGENT}
ACCESS = {
    "listar_vendedores": set(ACTORS),
    "proyecciones": set(ACTORS),
    "confirmacion_del_equipo": set(ACTORS),
    "saca_sugerida": TEAM,
    "stock": TEAM | {"despacho"},
    "produccion": TEAM | {"despacho"},
    "cargas_de_archivos": TEAM,
}
SPAN = {"fecha_desde": day(-1), "fecha_hasta": day(3)}
ARGS = {
    "listar_vendedores": {},
    "proyecciones": SPAN,
    "confirmacion_del_equipo": {"fecha": day(1)},
    "saca_sugerida": {"fecha": day(0)},
    "stock": SPAN,
    "produccion": SPAN,
    "cargas_de_archivos": {},
}
SLOW = settings(
    max_examples=examples(25),
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow],
)


@pytest.fixture
def scene(mcp_db):
    for (seller, offset), units in SUBMITTED.items():
        submit(seller, offset, {"P0001": units})
    tokens = {u: token(mcp_db, u) for u in ACTORS if u != AGENT}
    return {**tokens, AGENT: AGENT_TOKEN}


def _expected_projections(actor: str, requested: str | None) -> set[tuple[str, str]]:
    """Oráculo: (vendedor, fecha) que la especificación deja ver a `actor`."""
    if actor in SELLERS:
        visible = {actor}  # pida a quien pida
    elif actor in TEAM:
        visible = set(SELLERS) if requested is None else {requested}
    else:  # jefe de despacho: no proyecta ni ve al equipo
        visible = set()
    return {(s, day(o)) for (s, o) in SUBMITTED if s in visible}


requested_seller = st.one_of(
    st.none(),
    st.sampled_from([*SELLERS, "supervisor", "general", "despacho", "nadie", "agente:n8n"]),
    st.text(alphabet=string.ascii_lowercase + "._-:", min_size=1, max_size=12),
)


@SLOW
@given(actor=st.sampled_from(ACTORS), requested=requested_seller)
def test_projection_scope_follows_the_role(scene, actor, requested) -> None:
    args = {**SPAN, **({"vendedor": requested} if requested is not None else {})}
    failed, text = call(scene[actor], "proyecciones", args)
    assert not failed, text
    seen = {(p["vendedor"], p["fecha"]) for p in json.loads(text)["proyecciones"]}
    assert seen == _expected_projections(actor, requested), (actor, requested)


@SLOW
@given(actor=st.sampled_from(ACTORS), tool=st.sampled_from(sorted(ACCESS)))
def test_tool_access_follows_the_role(scene, actor, tool) -> None:
    failed, text = call(scene[actor], tool, ARGS[tool])
    assert failed == (actor not in ACCESS[tool]), (actor, tool, text)
    if failed:
        assert "permiso" in text or "rol" in text, text


@SLOW
@given(actor=st.sampled_from(ACTORS))
def test_nobody_sees_other_sellers_in_the_team_view(scene, actor) -> None:
    failed, text = call(scene[actor], "confirmacion_del_equipo", {"fecha": day(1)})
    assert not failed, text
    body = json.loads(text)
    names = {p["usuario"] for p in body["con_proyeccion"] + body["sin_proyeccion"]}
    if actor in SELLERS:
        assert names == {actor}  # solo él mismo
    elif actor == "despacho":
        assert names == set()  # no proyecta ni ve al equipo
    else:
        assert body["vendedores"] == 7


# --- Fuzzing por el transporte real ------------------------------------------------------

junk = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(min_value=-(2**70), max_value=2**70),
    st.floats(allow_nan=True, allow_infinity=True),
    st.text(max_size=40),
    st.dates().map(lambda d: d.isoformat()),
    st.lists(st.integers(), max_size=3),
    st.dictionaries(st.text(max_size=5), st.integers(), max_size=2),
)


@pytest.mark.fuzz
@settings(
    max_examples=examples(40),
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow],
)
@given(data=st.data())
def test_tools_never_crash(scene, data) -> None:
    tools = {t.name: t.input_schema for t in list_tools(AGENT_TOKEN)}
    name = data.draw(st.sampled_from(sorted(tools)), label="tool")
    keys = [*tools[name].get("properties", {}), "otra_cosa"]
    args = data.draw(st.dictionaries(st.sampled_from(keys), junk, max_size=4), label="args")
    actor = data.draw(st.sampled_from(ACTORS), label="actor")
    failed, text = call(scene[actor], name, args)
    # Un fallo interno llega como «Error executing tool X» sin explicación: nunca debe pasar.
    assert text.strip() != f"Error executing tool {name}", (name, args)
    if not failed:
        json.loads(text)
