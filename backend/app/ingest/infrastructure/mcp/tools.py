"""Herramienta MCP de la ingesta (ADR 0017): las últimas cargas de archivos y su estado.

Llama al mismo caso de uso que `GET /ingest/log`. La ingesta no conoce los roles de la
planificación: quién puede ver las cargas lo decide `may_view`, que conecta `app.main`.
"""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field

from app.core.config import get_settings
from app.ingest.bootstrap import build_use_cases
from app.ingest.domain.models import IngestStatus, LogRecord
from app.shared.infrastructure.database.session import SessionLocal
from app.shared.infrastructure.mcp.server import (
    Identity,
    compact_json,
    current_identity,
    domain_errors,
)

DENIED = "No tienes permiso para ver las cargas de archivos."
# Errores por carga que se devuelven (el resto está en la pantalla de la ingesta).
MAX_ERRORS = 3
MAX_ERROR_TEXT = 200

Status = Annotated[
    IngestStatus | None,
    Field(
        description=(
            "Filtra por estado: failed (no se cargó nada), partial (con filas con error), "
            "needs_mapping (faltan columnas: hay que confirmar un mapeo) u ok. Vacío = todas."
        )
    ),
]
Limit = Annotated[int, Field(ge=1, le=100, description="Cuántas cargas, de la más reciente.")]


def _local(moment: datetime) -> str:
    """En la hora del negocio. Sin zona (SQLite) se asume UTC, como la guarda la base."""
    aware = moment if moment.tzinfo else moment.replace(tzinfo=UTC)
    return aware.astimezone(ZoneInfo(get_settings().tz)).isoformat(timespec="minutes")


def _errors(record: LogRecord) -> list[str]:
    return [str(e)[:MAX_ERROR_TEXT] for e in (record.errors_json or [])[:MAX_ERRORS]]


def _record_out(record: LogRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "archivo": record.file_name,
        "origen": record.source,
        "estado": record.status,
        "filas_cargadas": record.rows_ok,
        "filas_con_error": record.rows_error,
        "cargada_el": _local(record.created_at),
        "primeros_errores": _errors(record),
    }


def register(server: MCPServer, may_view: Callable[[Identity], bool]) -> None:
    def cargas_de_archivos(estado: Status = None, limite: Limit = 20) -> str:
        if not may_view(current_identity()):
            raise ToolError(DENIED)
        with SessionLocal() as session, domain_errors():
            records = build_use_cases(session, get_settings()).list_log(limite, estado)
        return compact_json(
            {
                "zona_horaria": get_settings().tz,
                "cargas": [_record_out(r) for r in records],
                "cantidad": len(records),
            }
        )

    server.add_tool(
        cargas_de_archivos,
        name="cargas_de_archivos",
        title="Cargas de archivos",
        description=(
            "Últimas cargas de archivos Excel o CSV (ventas, pedidos, catálogo) y su resultado, "
            "de la más reciente a la más antigua. Para «¿qué cargas fallaron hoy?», usa "
            "estado=failed y quédate con las de `cargada_el` de hoy (hora de Lima). "
            "Solo supervisores."
        ),
        annotations=ToolAnnotations(
            read_only_hint=True, destructive_hint=False, idempotent_hint=True
        ),
        structured_output=False,
    )
