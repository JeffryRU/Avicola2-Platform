"""Chequeos de salud.

- `/health` (liveness): solo confirma que el proceso responde. No toca la base, así un pico de
  uso que agote el pool o un corte breve de Supabase no saca al backend del proxy
  (Docker/Coolify/Traefik usan este).
- `/health/ready` (readiness): además confirma que la base es alcanzable. Para monitoreo.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.shared.infrastructure.database.session import get_session

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
def ready(response: Response, session: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        logger.error("Base de datos inalcanzable: %s", str(exc.__cause__ or exc).splitlines()[0])
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "error", "database": "unreachable"}
    return {"status": "ok", "database": "ok"}
