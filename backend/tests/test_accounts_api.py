"""Seguridad de cuentas: cookie HttpOnly, bloqueo, contraseñas, supervisor, CSRF y cabeceras."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app
from app.planning.domain.accounts import LockoutPolicy, check_new_password
from app.planning.infrastructure import cli
from app.planning.infrastructure.security import JwtTokenService, RandomTemporaryPasswords
from app.shared.domain.errors import DomainError
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

NEW_PASSWORD = "Pollo-fresco-2026"


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
    return TestClient(app)


def _login(client, username="rnavarro", password="demo1234", remember=False):
    return client.post(
        "/api/auth/login",
        json={"username": username, "password": password, "remember": remember},
    )


# --- Sesión en cookie -----------------------------------------------------------------


def test_login_sets_httponly_cookie_and_never_returns_the_token(client):
    r = _login(client)
    assert r.status_code == 200
    assert r.json() == {
        "seller": {
            "username": "rnavarro",
            "name": "Roberto Navarro",
            "zone": "Trujillo",
            "role": "seller",
        },
        "must_change_password": False,
    }
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("nv_session=")
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie and "Path=/api" in cookie
    assert "Max-Age" not in cookie  # sin "Recordarme": se borra al cerrar el navegador
    assert "token" not in r.text and r.cookies["nv_session"] not in r.text
    assert "demo1234" not in r.text


def test_remember_me_makes_the_cookie_persistent(client):
    cookie = _login(client, remember=True).headers["set-cookie"]
    assert f"Max-Age={get_settings().auth_token_ttl_hours * 3600}" in cookie


def test_logout_clears_the_cookie(client):
    _login(client)
    assert client.get("/api/auth/me").status_code == 200
    r = client.post("/api/auth/logout")
    assert r.status_code == 204 and 'nv_session=""' in r.headers["set-cookie"]
    assert client.get("/api/auth/me").status_code == 401


def test_api_responses_are_not_cached(client):
    _login(client)
    assert client.get("/api/catalog").headers["cache-control"] == "no-store"


# --- Login: errores genéricos y bloqueo ---------------------------------------------


def test_unknown_user_and_wrong_password_look_the_same(client):
    a = _login(client, "noexiste", "loquesea1")
    b = _login(client, "rnavarro", "mala-clave-1")
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json() == {"detail": "Usuario o contraseña incorrectos."}


def test_account_locks_after_repeated_failures(client):
    for _ in range(get_settings().login_max_attempts - 1):
        assert "incorrectos" in _login(client, password="mala-clave-1").json()["detail"]
    locked = _login(client, password="mala-clave-1")
    assert locked.status_code == 401 and "bloqueada" in locked.json()["detail"]
    # Ni con la contraseña correcta mientras dura el bloqueo.
    assert "bloqueada" in _login(client).json()["detail"]


def test_lockout_policy_unlocks_after_the_window():
    now = datetime(2026, 11, 3, 8, tzinfo=UTC)
    policy = LockoutPolicy(max_attempts=3, lock_minutes=15)
    assert policy.after_failure(0, now) == (1, None)
    assert policy.after_failure(2, now) == (0, now + timedelta(minutes=15))


# --- Cambio de contraseña ------------------------------------------------------------


def test_change_password_rotates_the_session(client):
    _login(client)
    old = client.cookies["nv_session"]
    r = client.post(
        "/api/auth/password",
        json={"current_password": "demo1234", "new_password": NEW_PASSWORD},
    )
    assert r.status_code == 200, r.text
    assert client.cookies["nv_session"] != old
    assert client.get("/api/catalog").status_code == 200
    # La sesión anterior (otro dispositivo) quedó invalidada.
    stale = TestClient(app)
    stale.cookies.set("nv_session", old, path="/api")
    assert stale.get("/api/catalog").status_code == 401
    assert _login(TestClient(app), password=NEW_PASSWORD).status_code == 200


@pytest.mark.parametrize(
    ("current", "new", "error"),
    [
        ("mala", NEW_PASSWORD, "actual no es correcta"),
        ("demo1234", "demo1234", "distinta"),
        ("demo1234", "corta1", "entre 8"),
        ("demo1234", "solamenteletras", "letras y números"),
        ("demo1234", "rnavarro2026", "fácil de adivinar"),
    ],
)
def test_change_password_rules(client, current, new, error):
    _login(client)
    r = client.post("/api/auth/password", json={"current_password": current, "new_password": new})
    assert r.status_code == 422 and error in r.json()["detail"]


def test_password_policy_rejects_common_passwords():
    with pytest.raises(DomainError):
        check_new_password("Password1", "ana")
    check_new_password("Brasa-norte-7", "ana")


# --- Supervisor: alta, recuperación y desactivación ----------------------------------


def test_only_supervisor_manages_accounts(client):
    _login(client)
    assert client.get("/api/admin/accounts").status_code == 403
    assert client.post("/api/admin/accounts/hdias/reset-password").status_code == 403


def test_supervisor_creates_account_with_temporary_password(client):
    _login(client, "supervisor")
    r = client.post(
        "/api/admin/accounts", json={"username": "LTorres", "name": "Luis Torres", "zone": "Sur"}
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["account"]["username"] == "ltorres" and body["account"]["must_change_password"]
    temporary = body["temporary_password"]
    assert (
        client.post("/api/admin/accounts", json={"username": "ltorres", "name": "Otro"}).status_code
        == 409
    )

    seller = TestClient(app)
    login = _login(seller, "ltorres", temporary)
    assert login.json()["must_change_password"] is True
    # Con la temporal solo puede cambiar la contraseña.
    assert seller.get("/api/catalog").status_code == 403
    changed = seller.post(
        "/api/auth/password", json={"current_password": temporary, "new_password": NEW_PASSWORD}
    )
    assert changed.json()["must_change_password"] is False
    assert seller.get("/api/catalog").status_code == 200


def test_reset_password_unlocks_and_closes_sessions(client):
    seller = TestClient(app)
    _login(seller)
    for _ in range(get_settings().login_max_attempts):
        _login(TestClient(app), password="mala-clave-1")

    _login(client, "supervisor")
    r = client.post("/api/admin/accounts/rnavarro/reset-password")
    assert r.status_code == 200
    temporary = r.json()["temporary_password"]
    assert seller.get("/api/auth/me").status_code == 401  # sesión anterior cerrada
    assert _login(TestClient(app), "rnavarro", temporary).json()["must_change_password"]


def test_deactivated_account_cannot_log_in(client):
    seller = TestClient(app)
    _login(seller)
    _login(client, "supervisor")
    r = client.patch("/api/admin/accounts/rnavarro", json={"active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    assert seller.get("/api/catalog").status_code == 401
    assert _login(TestClient(app)).status_code == 401
    assert client.patch("/api/admin/accounts/supervisor", json={"active": False}).status_code == 422


def test_temporary_passwords_are_random_and_mixed():
    passwords = {RandomTemporaryPasswords().generate() for _ in range(50)}
    assert len(passwords) == 50
    assert all(any(c.isdigit() for c in p) and any(c.isalpha() for c in p) for p in passwords)


# --- Tokens --------------------------------------------------------------------------


def test_tokens_from_another_secret_or_without_version_are_rejected():
    tokens = JwtTokenService("a" * 40, 1)
    assert tokens.decode(tokens.issue("rnavarro", 3)).version == 3
    assert JwtTokenService("b" * 40, 1).decode(tokens.issue("rnavarro", 3)) is None
    assert tokens.decode("no-es-un-jwt") is None


# --- CSRF y cabeceras ----------------------------------------------------------------


def test_cross_site_writes_are_blocked(client):
    _login(client)
    evil = {"Origin": "https://sitio-malicioso.example", "Sec-Fetch-Site": "cross-site"}
    body = {"current_password": "demo1234", "new_password": NEW_PASSWORD}
    assert client.post("/api/auth/password", json=body, headers=evil).status_code == 403
    assert _login(client).status_code == 200  # la contraseña no cambió
    same = {"Origin": "http://testserver", "Sec-Fetch-Site": "same-origin"}
    assert client.post("/api/auth/logout", headers=same).status_code == 204


def test_security_headers(client):
    headers = client.get("/health").headers
    assert headers["x-frame-options"] == "DENY"
    assert headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in headers["content-security-policy"]
    assert "script-src 'self'" in headers["content-security-policy"]


# --- Configuración -------------------------------------------------------------------


def test_production_config_requires_secrets_and_https():
    problems = Settings(app_env="production", auth_secret="corto", ingest_api_token=None)
    text = " ".join(problems.security_problems())
    assert "AUTH_SECRET" in text and "INGEST_API_TOKEN" in text
    ok = Settings(app_env="production", auth_secret="x" * 40, ingest_api_token="token-n8n")
    assert ok.security_problems() == [] and ok.cookie_secure


def test_empty_cookie_secure_means_automatic(monkeypatch):
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "")
    assert Settings(app_env="local").cookie_secure is False
    assert Settings(app_env="production").cookie_secure is True


def _app_with_trusted(*origins: str) -> TestClient:
    from fastapi import FastAPI

    from app.shared.infrastructure.http.security import install_security

    mini = FastAPI()
    install_security(mini, https=True, trusted_origins=origins)

    @mini.post("/api/x")
    def x() -> dict[str, bool]:
        return {"ok": True}

    return TestClient(mini)


def test_trusted_frontend_origin_is_allowed_behind_a_proxy():
    """Vercel reenvía /api: el Origin es el de Vercel y el Host, el del backend."""
    c = _app_with_trusted("https://avicola2.vercel.app", "https://avicola2-*.vercel.app")
    same = {"Sec-Fetch-Site": "same-origin"}
    assert (
        c.post("/api/x", headers={**same, "Origin": "https://avicola2.vercel.app"}).status_code
        == 200
    )
    preview = {**same, "Origin": "https://avicola2-git-develop-jeff.vercel.app"}
    assert c.post("/api/x", headers=preview).status_code == 200
    evil = {**same, "Origin": "https://avicola2.vercel.app.evil.example"}
    assert c.post("/api/x", headers=evil).status_code == 403
    assert c.post("/api/x", headers={"Origin": "https://otro.vercel.app"}).status_code == 403


def test_trusted_origins_setting_parses_a_comma_list():
    s = Settings(trusted_origins=" https://a.vercel.app/ , https://b-*.vercel.app ,")
    assert s.trusted_origin_list == ("https://a.vercel.app", "https://b-*.vercel.app")


def test_update_own_profile_name(client):
    _login(client)
    r = client.patch("/api/auth/profile", json={"name": "  Roberto   Navarro Ruiz "})
    assert r.status_code == 200, r.text
    assert r.json()["seller"]["name"] == "Roberto Navarro Ruiz"
    assert client.get("/api/auth/me").json()["seller"]["name"] == "Roberto Navarro Ruiz"
    assert client.patch("/api/auth/profile", json={"name": "   "}).status_code == 422


def test_update_profile_requires_session(client):
    client.cookies.clear()
    assert client.patch("/api/auth/profile", json={"name": "Alguien"}).status_code == 401
