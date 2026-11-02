"""Contraseñas (scrypt de la librería estándar) y tokens de sesión (JWT HS256)."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt

from app.planning.application.ports import TokenClaims

# Mismos parámetros que crypto.scryptSync de Node (N=16384, r=8, p=1, 32 bytes): los hashes
# "sal:hash" creados por el mockup en Azure SQL siguen siendo válidos.
_N, _R, _P, _LEN = 16384, 8, 1, 32


def _scrypt(password: str, salt: str) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt.encode(), n=_N, r=_R, p=_P, dklen=_LEN)


class ScryptPasswordHasher:
    dummy_hash = f"{'0' * 32}:{'0' * 64}"

    def hash(self, password: str) -> str:
        salt = secrets.token_hex(16)
        return f"{salt}:{_scrypt(password, salt).hex()}"

    def verify(self, password: str, stored: str) -> bool:
        salt, _, digest = (stored or "").partition(":")
        if not salt or not digest:
            return False
        return hmac.compare_digest(_scrypt(password, salt).hex(), digest)


class JwtTokenService:
    """JWT firmado (HS256). Viaja en una cookie HttpOnly: el JavaScript de la página no lo lee."""

    ALGORITHM = "HS256"
    AUDIENCE = "avicola2-planning"

    def __init__(self, secret: str, ttl_hours: int) -> None:
        self.secret, self.ttl = secret, timedelta(hours=ttl_hours)

    def issue(self, username: str, version: int) -> str:
        now = datetime.now(UTC)
        claims = {
            "sub": username,
            "ver": version,
            "aud": self.AUDIENCE,
            "iat": now,
            "exp": now + self.ttl,
        }
        return jwt.encode(claims, self.secret, algorithm=self.ALGORITHM)

    def decode(self, token: str) -> TokenClaims | None:
        try:
            claims = jwt.decode(
                token,
                self.secret,
                algorithms=[self.ALGORITHM],
                audience=self.AUDIENCE,
                options={"require": ["sub", "ver", "exp"]},
            )
        except jwt.PyJWTError:
            return None
        if not isinstance(claims["sub"], str) or not isinstance(claims["ver"], int):
            return None
        return TokenClaims(claims["sub"], claims["ver"])


class RandomTemporaryPasswords:
    """Contraseña temporal legible (sin caracteres ambiguos), con letras y números."""

    _ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

    def generate(self) -> str:
        while True:
            chars = "".join(secrets.choice(self._ALPHABET) for _ in range(12))
            if any(c.isdigit() for c in chars) and any(c.isalpha() for c in chars):
                return f"{chars[:4]}-{chars[4:8]}-{chars[8:]}"
