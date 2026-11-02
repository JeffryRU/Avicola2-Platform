"""Traduce los errores de dominio a respuestas HTTP (mismo formato que FastAPI: {"detail": ...})."""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.shared.domain.errors import AuthenticationError, DomainError, NotFoundError

STATUS_BY_ERROR: dict[type[DomainError], int] = {
    AuthenticationError: status.HTTP_401_UNAUTHORIZED,
    NotFoundError: status.HTTP_404_NOT_FOUND,
    DomainError: status.HTTP_422_UNPROCESSABLE_CONTENT,
}


def register_error_handlers(app: FastAPI) -> None:
    async def handle(_: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, DomainError)
        code = next(c for t, c in STATUS_BY_ERROR.items() if isinstance(exc, t))
        return JSONResponse({"detail": exc.message}, status_code=code)

    app.add_exception_handler(DomainError, handle)
