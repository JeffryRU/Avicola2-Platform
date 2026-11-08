"""Reglas de las cuentas: contraseñas, nombres de usuario y bloqueo por intentos fallidos."""

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum

from app.planning.domain.permissions import GUARDIAN_ROLE
from app.shared.domain.errors import DomainError

MIN_PASSWORD, MAX_PASSWORD = 8, 128
_USERNAME = re.compile(r"^[a-z0-9._-]{3,30}$")
# Las más usadas en filtraciones (y la de prueba): se rechazan aunque cumplan el largo.
COMMON_PASSWORDS = frozenset(
    {
        "12345678",
        "123456789",
        "1234567890",
        "password",
        "password1",
        "contraseña",
        "contrasena",
        "qwerty123",
        "iloveyou",
        "admin123",
        "abc12345",
        "demo1234",
        "noraves123",
        "avicola123",
    }
)


def check_new_password(password: str, username: str) -> None:
    """Política mínima (largo, letras y números, no obvia). Lanza DomainError si no cumple."""
    if not MIN_PASSWORD <= len(password) <= MAX_PASSWORD:
        raise DomainError(
            f"La contraseña debe tener entre {MIN_PASSWORD} y {MAX_PASSWORD} caracteres."
        )
    if not (re.search(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]", password) and re.search(r"\d", password)):
        raise DomainError("La contraseña debe combinar letras y números.")
    lowered = password.lower()
    if lowered in COMMON_PASSWORDS or username.lower() in lowered:
        raise DomainError("Esa contraseña es muy fácil de adivinar. Elige otra.")


MAX_NAME = 100


def clean_name(name: str) -> str:
    """Nombre visible: sin espacios sobrantes, no vacío y de largo razonable."""
    cleaned = " ".join(name.split())
    if not cleaned:
        raise DomainError("Ingresa el nombre.")
    if len(cleaned) > MAX_NAME:
        raise DomainError(f"El nombre puede tener como máximo {MAX_NAME} caracteres.")
    return cleaned


def check_username(username: str) -> None:
    if not _USERNAME.match(username):
        raise DomainError(
            "El usuario debe tener de 3 a 30 caracteres: minúsculas, números, punto, guion o _."
        )


@dataclass(frozen=True)
class LockoutPolicy:
    """Tras `max_attempts` fallos seguidos la cuenta se bloquea `lock_minutes` minutos."""

    max_attempts: int = 5
    lock_minutes: int = 15

    def after_failure(self, failed_logins: int, now: datetime) -> tuple[int, datetime | None]:
        """Devuelve (fallos acumulados, bloqueada hasta)."""
        failed = failed_logins + 1
        if failed >= self.max_attempts:
            return 0, now + timedelta(minutes=self.lock_minutes)
        return failed, None


class ChangeOutcome(Enum):
    APPLIED = "applied"
    NOT_FOUND = "not_found"
    ACTOR_CHANGED = "actor_changed"  # el actor ya no tiene ese rol o su sesión cambió
    TARGET_CHANGED = "target_changed"  # la cuenta destino cambió de rol mientras tanto
    LAST_GUARDIAN = "last_guardian"  # dejaría sin ninguna cuenta activa de GUARDIAN_ROLE


@dataclass(frozen=True)
class AccountChange:
    """Cambio administrativo sobre una cuenta, con las condiciones que deben seguir valiendo
    al momento de escribir.

    El caso de uso decide con lo que leyó; entre esa lectura y la escritura otra petición pudo
    cambiar algo (ascender a la cuenta destino, degradar al actor...). Por eso el repositorio
    vuelve a comprobar todo en la misma transacción, con las filas bloqueadas, y solo escribe
    las columnas que cambian (nunca una "foto" vieja de la cuenta).
    """

    target: str
    # Roles que la cuenta destino debe seguir teniendo (los que el actor puede gestionar).
    target_roles: frozenset[str]
    # Quién lo pide; None = la consola del servidor (sin actor que comprobar).
    actor: str | None = None
    actor_role: str | None = None
    actor_version: int | None = None
    # Lo que cambia (None = no se toca).
    role: str | None = None
    active: bool | None = None
    # Restablecer: nueva contraseña temporal (obligada a cambiarse) y desbloqueo.
    password_hash: str | None = None
    # Sube la versión de sesión: los tokens anteriores de la cuenta dejan de valer.
    revoke_sessions: bool = False
    keep_one_active: str = GUARDIAN_ROLE

    def removes_guardian(self, current_role: str, current_active: bool) -> bool:
        """¿Esta cuenta deja de ser una cuenta activa de `keep_one_active`?"""
        if current_role != self.keep_one_active or not current_active:
            return False
        demoted = self.role is not None and self.role != self.keep_one_active
        return demoted or self.active is False
