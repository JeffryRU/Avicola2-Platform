"""Fuzzing de la API de administración con Schemathesis (a partir del OpenAPI de la app).

Para cada endpoint de /api/admin, Schemathesis genera cuerpos y parámetros (válidos e inválidos).
Cada caso se envía como vendedor, supervisor y supervisor general, y se comprueba:

- nunca un error 500;
- la regla de la especificación (escrita aquí, sin usar domain/permissions.py): nadie gestiona
  algo que su rol no permite, aunque el cuerpo o la ruta lleguen con valores raros.

El nombre de usuario de la ruta se sesga hacia cuentas reales para que la autorización se ponga
a prueba (con nombres aleatorios casi todo sería 404).
"""

import zlib

import pytest
import schemathesis
from conftest import examples
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, settings

from app.core.config import get_settings
from app.main import app
from app.planning.infrastructure import cli
from app.planning.infrastructure.persistence.repositories import SqlSellerRepository
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

schema = schemathesis.openapi.from_asgi("/openapi.json", app).include(path_regex="^/api/admin/")
ACTORS = ("rnavarro", "supervisor", "general")
REAL_USERS = ("general", "supervisor", "rnavarro", "hdias", "nadie")


pytestmark = [pytest.mark.usefixtures("fast_hasher"), pytest.mark.fuzz]


def _fresh_tokens() -> dict[str, str]:
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
    client = TestClient(app)
    tokens = {}
    for username in ACTORS:
        r = client.post("/api/auth/token", json={"username": username, "password": "demo1234"})
        tokens[username] = r.json()["token"]
    return tokens


def _role_of(username: str) -> str | None:
    with SessionLocal() as session:
        account = SqlSellerRepository(session).get_account(username, active_only=False)
    return account.seller.role if account else None


def _must_be_rejected(actor: str, method: str, path: str, body, target: str | None) -> bool:
    """True si la especificación prohíbe que este actor tenga éxito con esta petición."""
    actor_role = _role_of(actor)
    if actor_role == "seller" or (target is not None and target == actor):
        return True  # un vendedor nunca administra; nadie se gestiona a sí mismo desde Usuarios
    if actor_role == "general_supervisor":
        return False
    # Supervisor: solo vendedores, y nunca cambia roles.
    if path.endswith("/role"):
        return True
    if method == "POST" and path == "/api/admin/accounts":
        return isinstance(body, dict) and body.get("role", "seller") != "seller"
    return (
        target is not None and "/editing/" not in path and _role_of(target) not in (None, "seller")
    )


@schema.parametrize()
@settings(
    max_examples=examples(10),
    deadline=None,
    suppress_health_check=list(HealthCheck),
)
def test_admin_api_never_breaks_and_never_over_grants(case):
    params = case.path_parameters or {}
    if "username" in params:
        # Casi siempre un usuario real (si no, lo que generó Schemathesis), de forma determinista.
        pick = zlib.crc32(repr((params, case.body)).encode()) % (len(REAL_USERS) + 1)
        if pick < len(REAL_USERS):
            params["username"] = REAL_USERS[pick]
    target = (case.path_parameters or {}).get("username")
    tokens = _fresh_tokens()
    for actor in ACTORS:
        forbidden = _must_be_rejected(actor, case.method, case.formatted_path, case.body, target)
        response = case.call(headers={"Authorization": f"Bearer {tokens[actor]}"})
        assert response.status_code < 500, (actor, case.method, case.path, response.text)
        if forbidden:
            assert not 200 <= response.status_code < 300, (
                f"{actor} logró {case.method} {case.formatted_path} {case.body!r}: "
                f"{response.status_code} {response.text}"
            )


# --- Toda la API autenticada: nunca un 500 ---------------------------------------------

whole_api = (
    schemathesis.openapi.from_asgi("/openapi.json", app)
    .include(path_regex="^/api/")
    .exclude(path_regex="^/api/(events|internal)")
)  # SSE (no termina) y n8n (token de servicio)


@whole_api.parametrize()
@settings(max_examples=examples(8), deadline=None, suppress_health_check=list(HealthCheck))
def test_whole_api_never_returns_a_server_error(case):
    tokens = _fresh_tokens()
    for actor in ("rnavarro", "general"):
        response = case.call(headers={"Authorization": f"Bearer {tokens[actor]}"})
        assert response.status_code < 500, (actor, case.method, case.formatted_path, response.text)


# --- Regresiones que encontró el fuzzing -----------------------------------------------


def test_huge_ids_are_rejected_instead_of_breaking_the_database():
    """Un id fuera del rango de la columna (int4) daba 500; ahora es 422."""
    _fresh_tokens()
    general, seller = TestClient(app), TestClient(app)
    general.post("/api/auth/login", json={"username": "general", "password": "demo1234"})
    seller.post("/api/auth/login", json={"username": "rnavarro", "password": "demo1234"})
    huge = 2**63
    r = general.post(f"/api/admin/editing/unlocks/{huge}", json={"action": "approve"})
    assert r.status_code == 422
    assert seller.post("/api/notifications/read", json={"ids": [huge]}).status_code == 422
    assert seller.post("/api/notifications/read", json={"ids": [0]}).status_code == 422
