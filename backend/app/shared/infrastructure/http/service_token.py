"""Token de servicio para las llamadas de n8n (cabecera X-Api-Token = INGEST_API_TOKEN)."""

import secrets
from typing import Annotated

from fastapi import Header, HTTPException, status

from app.core.config import get_settings


def require_service_token(x_api_token: Annotated[str | None, Header()] = None) -> None:
    """Exige X-Api-Token si INGEST_API_TOKEN está configurado (fuera de local es obligatorio)."""
    expected = get_settings().ingest_api_token
    if expected and not (x_api_token and secrets.compare_digest(x_api_token, expected)):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token de servicio inválido")
