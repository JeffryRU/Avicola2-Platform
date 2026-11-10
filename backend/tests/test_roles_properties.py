"""Tests basados en propiedades de roles y permisos (Hypothesis).

1. Propiedades de la tabla de permisos, para cualquier rol (también roles inventados).
2. Máquina de estados contra la API real: secuencias aleatorias de altas, restablecimientos,
   activaciones y cambios de rol hechas por actores aleatorios. Cada respuesta se compara con un
   ORÁCULO escrito a partir de la especificación, sin usar domain/permissions.py, para que un
   error en la tabla no se "confirme" a sí mismo.
"""

import pytest
from conftest import examples
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, event, given, settings
from hypothesis import strategies as st
from hypothesis.stateful import RuleBasedStateMachine, invariant, rule

from app.core.config import get_settings
from app.main import app
from app.planning.domain.permissions import (
    ROLES,
    Permission,
    assignable_roles,
    can,
    can_manage,
    manageable_roles,
    permissions_of,
    roles_with,
)
from app.planning.infrastructure import cli
from app.planning.infrastructure.persistence.repositories import SqlSellerRepository
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

pytestmark = pytest.mark.usefixtures("fast_hasher")

ANY_ROLE = st.one_of(st.sampled_from(ROLES), st.text(max_size=25))


# --- 1. Propiedades de la tabla ------------------------------------------------------


@given(ANY_ROLE)
def test_unknown_roles_have_nothing(role):
    if role not in ROLES:
        assert permissions_of(role) == frozenset()
        assert manageable_roles(role) == ()
        assert all(assignable_roles(role, t) == () for t in ROLES)


@given(ANY_ROLE, ANY_ROLE)
def test_nobody_creates_or_assigns_a_role_stronger_than_their_own(actor, target):
    for role in manageable_roles(actor):
        assert permissions_of(role) <= permissions_of(actor)
    assert set(assignable_roles(actor, target)) <= set(manageable_roles(actor))


@given(ANY_ROLE, ANY_ROLE)
def test_managing_requires_the_accounts_permission(actor, target):
    if can_manage(actor, target):
        assert can(actor, Permission.MANAGE_ACCOUNTS)
    if assignable_roles(actor, target):
        assert can(actor, Permission.CHANGE_ROLES) and can_manage(actor, target)


@given(ANY_ROLE)
def test_only_role_changers_manage_account_managers(actor):
    """Un supervisor no gestiona a otros supervisores: eso es de quien cambia roles."""
    managers = set(roles_with(Permission.MANAGE_ACCOUNTS))
    if not can(actor, Permission.CHANGE_ROLES):
        assert not managers & set(manageable_roles(actor))


# --- 2. Máquina de estados contra la API ----------------------------------------------


SEED_PASSWORD, OWN_PASSWORD = "demo1234", "Pollo-fresco-2026"
OK, REJECTED = "ok", "rejected"


def oracle(actor_role: str, op: str, target_role: str | None, new_role: str | None, own: bool):
    """La especificación, escrita a mano (no usa domain/permissions.py)."""
    if actor_role in ("seller", "dispatch_chief"):
        return REJECTED
    if op == "create":
        if new_role not in ("seller", "dispatch_chief", "supervisor", "general_supervisor"):
            return REJECTED
        return OK if actor_role == "general_supervisor" or new_role == "seller" else REJECTED
    if target_role is None or own:  # no existe, o es la propia cuenta
        return REJECTED
    if op == "role":
        valid = new_role in ("seller", "dispatch_chief", "supervisor", "general_supervisor")
        return OK if actor_role == "general_supervisor" and valid else REJECTED
    # reset, activate, deactivate
    return OK if actor_role == "general_supervisor" or target_role == "seller" else REJECTED


class AccountAdministration(RuleBasedStateMachine):
    def __init__(self):
        super().__init__()
        metadata.drop_all(engine)
        metadata.create_all(engine)
        with SessionLocal() as session:
            cli.init(session, get_settings())
            seed = SqlSellerRepository(session).list_accounts()
        # Modelo: lo que la base DEBERÍA tener según la especificación.
        self.model = {
            a.seller.username: {"role": a.seller.role, "active": True, "password": SEED_PASSWORD}
            for a in seed
        }
        self.clients: dict[str, TestClient] = {}
        self.counter = 0

    def _ready(self, username: str) -> TestClient:
        """Cliente con sesión vigente (entra y, si tiene temporal, la cambia)."""
        if username in self.clients:
            return self.clients[username]
        account = self.model[username]
        c = TestClient(app)
        r = c.post("/api/auth/login", json={"username": username, "password": account["password"]})
        assert r.status_code == 200, (username, r.text)
        if r.json()["must_change_password"]:
            r = c.post(
                "/api/auth/password",
                json={"current_password": account["password"], "new_password": OWN_PASSWORD},
            )
            assert r.status_code == 200, r.text
            account["password"] = OWN_PASSWORD
        self.clients[username] = c
        return c

    def _expect_revoked(self, username: str) -> None:
        old = self.clients.pop(username, None)
        if old is not None:
            assert old.get("/api/auth/me").status_code == 401, f"sesión de {username} sigue viva"

    def _check(self, expected: str, r, context) -> bool:
        event(f"{context[1]} por {self.model[context[0]]['role']}: {expected}")
        assert r.status_code < 500, (context, r.status_code, r.text)
        if expected == OK:
            assert 200 <= r.status_code < 300, (context, r.status_code, r.text)
            return True
        assert 400 <= r.status_code < 500, ("debió rechazarse", context, r.status_code, r.text)
        return False

    def _actor(self, data) -> str:
        """Sesgado a supervisores (en la semilla hay 7 vendedores y solo 2 supervisores)."""
        actors = sorted(u for u, a in self.model.items() if a["active"])
        staff = [u for u in actors if self.model[u]["role"] != "seller"] or actors
        pick = st.one_of(*[st.sampled_from(staff)] * 3, st.sampled_from(actors))
        return data.draw(pick, label="actor")

    @rule(data=st.data(), new_role=st.sampled_from([*ROLES, "admin", ""]))
    def create(self, data, new_role):
        actor = self._actor(data)
        username = f"usr{self.counter}"
        self.counter += 1
        r = self._ready(actor).post(
            "/api/admin/accounts", json={"username": username, "name": "X", "role": new_role}
        )
        expected = oracle(self.model[actor]["role"], "create", None, new_role, own=False)
        if self._check(expected, r, (actor, "create", new_role)):
            password = r.json()["temporary_password"]
            self.model[username] = {"role": new_role, "active": True, "password": password}

    @rule(data=st.data(), op=st.sampled_from(["reset", "activate", "deactivate", "role"]))
    def manage(self, data, op):
        actor = self._actor(data)
        target = data.draw(st.sampled_from([*sorted(self.model), "nadie", actor]), label="target")
        new_role = data.draw(st.sampled_from([*ROLES, "admin"]), label="new_role")
        target_role = self.model.get(target, {}).get("role")
        # Si la cuenta destino tiene sesión, debe cerrarse cuando corresponda.
        if target in self.model and self.model[target]["active"] and target != actor:
            self._ready(target)
        c = self._ready(actor)
        if op == "reset":
            r = c.post(f"/api/admin/accounts/{target}/reset-password")
        elif op == "role":
            r = c.put(f"/api/admin/accounts/{target}/role", json={"role": new_role})
        else:
            r = c.patch(f"/api/admin/accounts/{target}", json={"active": op == "activate"})
        expected = oracle(self.model[actor]["role"], op, target_role, new_role, own=target == actor)
        if not self._check(expected, r, (actor, op, target, target_role, new_role)):
            return
        account = self.model[target]
        if op == "reset":
            account["password"] = r.json()["temporary_password"]
            self._expect_revoked(target)
        elif op == "deactivate":
            account["active"] = False
            self._expect_revoked(target)
        elif op == "activate":
            account["active"] = True
        elif new_role != account["role"]:
            account["role"] = new_role
            self._expect_revoked(target)

    @invariant()
    def database_matches_the_model(self):
        with SessionLocal() as session:
            real = {
                a.seller.username: (a.seller.role, a.is_active)
                for a in SqlSellerRepository(session).list_accounts()
            }
        assert real == {u: (a["role"], a["active"]) for u, a in self.model.items()}

    @invariant()
    def there_is_always_an_active_general_supervisor(self):
        assert any(a["role"] == "general_supervisor" and a["active"] for a in self.model.values())


AccountAdministration.TestCase.settings = settings(
    max_examples=examples(15),
    stateful_step_count=25,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)
test_account_administration = pytest.mark.fuzz(AccountAdministration.TestCase)
