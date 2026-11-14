"""POST /api/client-logs: la PWA reporta sus errores y quedan en logs/frontend.log.

Es público (un error puede ocurrir antes del login), así que todo lo que llega se trata como
dato no confiable: tamaños acotados, una línea por mensaje y un límite por IP.
"""

import logging
import re
import time
from collections import defaultdict
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, Field

from app.shared.infrastructure.logging.setup import CLIENT_LOGGER

logger = logging.getLogger(CLIENT_LOGGER)
router = APIRouter(prefix="/api", tags=["logs"])

MAX_ENTRIES_PER_MINUTE = 30
LEVELS = {"error": logging.ERROR, "warning": logging.WARNING, "info": logging.INFO}
_SPACES = re.compile(r"\s+")
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")

Short = Annotated[str, Field(max_length=300)]


class ClientLogEntry(BaseModel):
    level: Literal["error", "warning", "info"] = "error"
    # error | unhandledrejection | react | ... (texto corto, solo para clasificar).
    kind: Annotated[str, Field(max_length=32, pattern=r"^[a-z_-]+$")] = "error"
    message: Annotated[str, Field(min_length=1, max_length=2000)]
    stack: Annotated[str | None, Field(max_length=8000)] = None
    route: Short = ""
    # Lo informa el navegador: sirve para ubicar el caso, no es una identidad verificada.
    user: Annotated[str | None, Field(max_length=64, pattern=r"^[\w.@-]+$")] = None
    app_version: Annotated[str | None, Field(max_length=40)] = None
    # Id de la petición a la API que falló (X-Request-ID): el mismo `[rid]` del log del backend.
    request_id: Annotated[str | None, Field(max_length=64, pattern=r"^[A-Za-z0-9._-]+$")] = None
    at: datetime | None = None


class ClientLogBatch(BaseModel):
    entries: Annotated[list[ClientLogEntry], Field(min_length=1, max_length=20)]


class _RateLimit:
    """Ventana fija de un minuto por IP; lo que excede se descarta."""

    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self.window = 0
        self.counts: defaultdict[str, int] = defaultdict(int)

    def allow(self, key: str, n: int) -> int:
        window = int(time.monotonic() // 60)
        if window != self.window:
            self.window, self.counts = window, defaultdict(int)
        allowed = max(0, min(n, self.per_minute - self.counts[key]))
        self.counts[key] += n
        return allowed


_limit = _RateLimit(MAX_ENTRIES_PER_MINUTE)


def _one_line(text: str) -> str:
    return _SPACES.sub(" ", _CONTROL.sub("", text)).strip()


def _stack(text: str | None) -> str:
    """La traza va indentada debajo: no puede hacerse pasar por otra línea de log."""
    if not text:
        return ""
    lines = [_CONTROL.sub("", line).rstrip() for line in text.splitlines()]
    return "".join(f"\n    {line}" for line in lines[:40] if line)


@router.post("/client-logs", status_code=status.HTTP_204_NO_CONTENT)
def client_logs(batch: ClientLogBatch, request: Request) -> Response:
    ip = request.client.host if request.client else "?"
    allowed = _limit.allow(ip, len(batch.entries))
    agent = _one_line(request.headers.get("user-agent", ""))[:200]
    for entry in batch.entries[:allowed]:
        logger.log(
            LEVELS[entry.level],
            "%s en %s: %s%s",
            entry.kind,
            _one_line(entry.route) or "?",
            _one_line(entry.message),
            _stack(entry.stack),
            extra={
                "user": entry.user or "-",
                "app_version": _one_line(entry.app_version or "") or "-",
                "client_time": entry.at.isoformat() if entry.at else "-",
                # No `request_id`: ese campo es el de esta petición (/client-logs).
                "api_request_id": entry.request_id or "-",
                "ip": ip,
                "user_agent": agent,
            },
        )
    if allowed < len(batch.entries):
        logging.getLogger("app.http").warning(
            "client-logs: %d reportes descartados de %s (límite %d/min)",
            len(batch.entries) - allowed,
            ip,
            MAX_ENTRIES_PER_MINUTE,
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
