"""Reglas de las cuentas: contraseñas, nombres de usuario y bloqueo por intentos fallidos."""

import re
from dataclasses import dataclass
from datetime import datetime, timedelta

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
