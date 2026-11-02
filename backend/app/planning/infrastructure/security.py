"""Contraseñas (scrypt de la librería estándar) y tokens de sesión (JWT HS256)."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt

# Mismos parámetros que crypto.scryptSync de Node (N=16384, r=8, p=1, 32 bytes): los hashes
# "sal:hash" creados por el mockup en Azure SQL siguen siendo válidos.
_N, _R, _P, _LEN = 16384, 8, 1, 32


def _scrypt(password: str, salt: str) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt.encode(), n=_N, r=_R, p=_P, dklen=_LEN)


class ScryptPasswordHasher:
    def hash(self, password: str) -> str:
        salt = secrets.token_hex(16)
        return f"{salt}:{_scrypt(password, salt).hex()}"

    def verify(self, password: str, stored: str) -> bool:
        salt, _, digest = (stored or "").partition(":")
        if not salt or not digest:
            return False
        return hmac.compare_digest(_scrypt(password, salt).hex(), digest)


class JwtTokenService:
    ALGORITHM = "HS256"

    def __init__(self, secret: str, ttl_hours: int) -> None:
        self.secret, self.ttl = secret, timedelta(hours=ttl_hours)

    def issue(self, username: str) -> str:
        now = datetime.now(UTC)
        claims = {"sub": username, "iat": now, "exp": now + self.ttl}
        return jwt.encode(claims, self.secret, algorithm=self.ALGORITHM)

    def subject(self, token: str) -> str | None:
        try:
            return jwt.decode(token, self.secret, algorithms=[self.ALGORITHM]).get("sub")
        except jwt.PyJWTError:
            return None
