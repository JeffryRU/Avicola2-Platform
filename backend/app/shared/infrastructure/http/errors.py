"""Traduce los errores de dominio a respuestas HTTP (mismo formato que FastAPI: {"detail": ...})."""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.shared.domain.errors import (
    AuthenticationError,
    ConflictError,
    DomainError,
    ForbiddenError,
    NotFoundError,
)

logger = logging.getLogger("app.http")

STATUS_BY_ERROR: dict[type[DomainError], int] = {
    AuthenticationError: status.HTTP_401_UNAUTHORIZED,
    ForbiddenError: status.HTTP_403_FORBIDDEN,
    NotFoundError: status.HTTP_404_NOT_FOUND,
    ConflictError: status.HTTP_409_CONFLICT,
    DomainError: status.HTTP_422_UNPROCESSABLE_CONTENT,
}


def register_error_handlers(app: FastAPI) -> None:
    async def handle(_: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, DomainError)
        code = next(c for t, c in STATUS_BY_ERROR.items() if isinstance(exc, t))
        # Errores esperados (datos inválidos, login fallido): INFO, no ensucian errors.log.
        logger.info("Rechazado (%s): %s", type(exc).__name__, exc.message)
        return JSONResponse({"detail": exc.message}, status_code=code)

    async def handle_validation(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, RequestValidationError)
        # Solo campo y motivo: el valor recibido puede ser una contraseña o un token.
        fields = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()
        )
        logger.info("Petición inválida: %s", fields)
        return await request_validation_exception_handler(request, exc)

    app.add_exception_handler(DomainError, handle)
    app.add_exception_handler(RequestValidationError, handle_validation)
