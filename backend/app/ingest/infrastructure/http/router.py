"""Endpoints de ingesta: subir archivos, reprocesar desde bronze, log y mapeos de columnas.

Adaptador de entrada de FastAPI; los errores de dominio los traduce
shared/infrastructure/http/errors.py.
"""

from dataclasses import asdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.ingest.bootstrap import IngestUseCases, build_use_cases
from app.ingest.domain.models import LogRecord, MappingRecord
from app.ingest.infrastructure.http.schemas import LogOut, MappingBody, MappingOut, TransformRequest
from app.shared.infrastructure.database.session import get_session
from app.shared.infrastructure.http.params import DbIdPath
from app.shared.infrastructure.http.service_token import require_service_token

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


router = APIRouter(prefix="/ingest", tags=["ingest"], dependencies=[Depends(require_service_token)])


def get_use_cases(session: Annotated[Session, Depends(get_session)]) -> IngestUseCases:
    return build_use_cases(session, get_settings())


UseCases = Annotated[IngestUseCases, Depends(get_use_cases)]


@router.post("/upload")
async def upload(
    use_cases: UseCases,
    file: Annotated[UploadFile, File(description="Excel (.xlsx/.xls) o CSV")],
    source: Annotated[str, Form()] = "upload",
    table: Annotated[
        str | None, Form(description="forzar tabla destino (si no, columna tipo)")
    ] = None,
) -> dict[str, Any]:
    """Guarda el archivo en bronze y lo carga en silver/gold."""
    use_cases.schema.require_table(table)
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "archivo de más de 20 MB")
    if not content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "archivo vacío")
    return asdict(use_cases.service.ingest(content, file.filename or "archivo", source, table))


@router.post("/transform")
def transform(use_cases: UseCases, body: TransformRequest) -> dict[str, Any]:
    """Reprocesa un archivo que ya está en bronze."""
    return asdict(use_cases.reprocess_file(body.bronze_path, body.table))


@router.get("/log", response_model=list[LogOut])
def ingestion_log(
    use_cases: UseCases,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    status_: Annotated[str | None, Query(alias="status")] = None,
) -> list[LogRecord]:
    return use_cases.list_log(limit, status_)


@router.get("/mappings", response_model=list[MappingOut])
def list_mappings(
    use_cases: UseCases, status_: Annotated[str | None, Query(alias="status")] = "pending"
) -> list[MappingRecord]:
    return use_cases.list_mappings(status_)


@router.put("/mappings/{mapping_id}/proposal", response_model=MappingOut)
def propose_mapping(use_cases: UseCases, mapping_id: DbIdPath, body: MappingBody) -> MappingRecord:
    """Guarda una propuesta de mapeo (la usa el flujo de IA de n8n). Queda pendiente."""
    return use_cases.propose_mapping(mapping_id, body.mapping)


@router.post("/mappings/{mapping_id}/confirm")
def confirm_mapping(
    use_cases: UseCases, mapping_id: DbIdPath, body: MappingBody | None = None
) -> dict[str, Any]:
    """Confirma el mapeo (el enviado o la propuesta) y reprocesa los archivos pendientes."""
    result = use_cases.confirm_mapping(mapping_id, body.mapping if body else None)
    return asdict(result)
