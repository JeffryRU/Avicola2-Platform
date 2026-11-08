"""Utilidades (y fixture `db`) de los tests adversariales de roles (revisión independiente)."""

from dataclasses import replace

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.main import app
from app.planning.bootstrap import build_use_cases
from app.planning.infrastructure import cli
from app.planning.infrastructure.http.router import get_use_cases
from app.planning.infrastructure.persistence.repositories import SqlSellerRepository
from app.planning.infrastructure.persistence.tables import sellers
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine, get_session

PASSWORD = "demo1234"
NEW_PASSWORD = "Pollo-fresco-2026"


@pytest.fixture
def db():
    app.dependency_overrides.clear()
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as session:
        cli.init(session, get_settings())
    yield
    app.dependency_overrides.clear()


def login(username: str, password: str = PASSWORD) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return c


def new_account(c: TestClient, username: str, role: str) -> TestClient:
    """Crea la cuenta y entra con ella ya con contraseña definitiva."""
    r = c.post("/api/admin/accounts", json={"username": username, "name": username, "role": role})
    assert r.status_code == 201, r.text
    other = login(username, r.json()["temporary_password"])
    r = other.post(
        "/api/auth/password",
        json={"current_password": r.json()["temporary_password"], "new_password": NEW_PASSWORD},
    )
    assert r.status_code == 200, r.text
    return other


def account(username: str):
    with SessionLocal() as s:
        return SqlSellerRepository(s).get_account(username, active_only=False)


def count_active(role: str) -> int:
    with SessionLocal() as s:
        return s.execute(
            select(func.count())
            .select_from(sellers)
            .where(sellers.c.role == role, sellers.c.is_active.is_(True))
        ).scalar_one()


def as_actor(username: str):
    """Ejecuta un caso de uso con su propia sesión, como lo haría otra petición concurrente."""
    return account(username)


def fresh_use_cases():
    s = SessionLocal()
    return s, build_use_cases(s, get_settings())


class HookedSellerRepository(SqlSellerRepository):
    """Igual que el real, pero ejecuta `hook` justo después de leer a `target` una vez:
    simula que otra petición confirma su escritura entre la lectura y la escritura."""

    def __init__(self, session: Session, target: str, hook) -> None:
        super().__init__(session)
        self.target, self.hook, self.fired = target, hook, False

    def get_account(self, username, active_only=True):
        found = super().get_account(username, active_only)
        if username == self.target and not self.fired:
            self.fired = True
            self.hook()
        return found


def override_use_cases(patch):
    """Sustituye el contenedor por uno real al que `patch(session, use_cases)` cambia piezas."""

    def _override(session: Session = Depends(get_session)):  # noqa: B008 (patrón de FastAPI)
        use_cases = build_use_cases(session, get_settings())
        return replace(use_cases, **patch(session, use_cases))

    app.dependency_overrides[get_use_cases] = _override
