"""Middleware HTTP: id por petición, una línea de log por petición y captura de errores 500."""

import logging
import re
import time
from collections.abc import Awaitable, Callable
from http import HTTPStatus
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from app.shared.infrastructure.logging.context import request_id

logger = logging.getLogger("app.http")

HEADER = "X-Request-ID"
# Se acepta el id que mande el cliente (p. ej., n8n) solo si es corto y seguro de imprimir.
_VALID_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
# Solo la API se registra en INFO; el healthcheck (cada 10 s) y los estáticos van en DEBUG.
API_PREFIXES = ("/api/", "/ingest/")


def _level(path: str, status: int) -> int:
    if status >= HTTPStatus.INTERNAL_SERVER_ERROR:
        return logging.ERROR
    if status >= HTTPStatus.BAD_REQUEST:
        return logging.WARNING
    return logging.INFO if path.startswith(API_PREFIXES) else logging.DEBUG


def install_request_logging(app: FastAPI) -> None:
    @app.middleware("http")
    async def log_request(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        incoming = request.headers.get(HEADER, "")
        rid = incoming if _VALID_ID.match(incoming) else uuid4().hex[:12]
        token = request_id.set(rid)
        start, path = time.perf_counter(), request.url.path
        try:
            try:
                response = await call_next(request)
            except Exception:
                # Error no previsto: traza completa en errors.log y respuesta genérica al cliente.
                logger.exception("Error no controlado en %s %s", request.method, path)
                response = JSONResponse(
                    {"detail": "Error interno del servidor.", "request_id": rid},
                    status_code=500,
                )
            response.headers[HEADER] = rid
            logger.log(
                _level(path, response.status_code),
                "%s %s → %s",
                request.method,
                path,
                response.status_code,
                extra={"duration_ms": round((time.perf_counter() - start) * 1000, 1)},
            )
            return response
        finally:
            request_id.reset(token)
