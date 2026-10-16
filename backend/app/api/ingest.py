"""Endpoints de ingesta: subir archivos, reprocesar desde bronze, log y mapeos de columnas."""

import secrets
from dataclasses import asdict
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.catalog import get_catalog
from app.core.config import get_settings
from app.db.models import ColumnMapping, IngestionLog
from app.db.session import get_session
from app.ingest.normalize import normalize_header
from app.ingest.pipeline import CONSTANT_PREFIX, IGNORE
from app.ingest.repository import SqlIngestRepository
from app.ingest.schema import get_schema
from app.ingest.service import IngestService
from app.lakehouse.store import get_lakehouse

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def require_service_token(x_api_token: Annotated[str | None, Header()] = None) -> None:
    """Si INGEST_API_TOKEN está configurado, exige el header X-Api-Token (lo usa n8n).

    Provisional hasta el login con JWT (paso 5 del MVP).
    """
    expected = get_settings().ingest_api_token
    if expected and not (x_api_token and secrets.compare_digest(x_api_token, expected)):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token de servicio inválido")


router = APIRouter(prefix="/ingest", tags=["ingest"], dependencies=[Depends(require_service_token)])
SessionDep = Annotated[Session, Depends(get_session)]


def get_service(session: SessionDep) -> IngestService:
    return IngestService(get_lakehouse(), SqlIngestRepository(session), get_schema(), get_catalog())


ServiceDep = Annotated[IngestService, Depends(get_service)]


def _check_table(table: str | None) -> None:
    if table is not None and table not in get_schema().tables:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"tabla desconocida: {table} (válidas: {', '.join(get_schema().tables)})",
        )


@router.post("/upload")
async def upload(
    service: ServiceDep,
    file: Annotated[UploadFile, File(description="Excel (.xlsx/.xls) o CSV")],
    source: Annotated[str, Form()] = "upload",
    table: Annotated[
        str | None, Form(description="forzar tabla destino (si no, columna tipo)")
    ] = None,
) -> dict[str, Any]:
    """Guarda el archivo en bronze y lo carga en silver/gold."""
    _check_table(table)
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "archivo de más de 20 MB")
    if not content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "archivo vacío")
    return asdict(service.ingest(content, file.filename or "archivo", source, table))


class TransformRequest(BaseModel):
    bronze_path: str
    table: str | None = None


@router.post("/transform")
def transform(service: ServiceDep, body: TransformRequest) -> dict[str, Any]:
    """Reprocesa un archivo que ya está en bronze."""
    _check_table(body.table)
    try:
        return asdict(service.reprocess(body.bronze_path, table=body.table))
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"no existe en bronze: {body.bronze_path}"
        ) from exc


class LogOut(BaseModel):
    id: int
    created_at: datetime
    file_name: str
    source: str
    status: str
    rows_ok: int
    rows_error: int
    bronze_path: str | None
    source_signature: str | None
    tables_json: dict[str, Any] | None
    errors_json: list[dict[str, Any]] | None

    model_config = {"from_attributes": True}


@router.get("/log", response_model=list[LogOut])
def ingestion_log(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    status_: Annotated[str | None, Query(alias="status")] = None,
) -> list[IngestionLog]:
    query = select(IngestionLog).order_by(desc(IngestionLog.id)).limit(limit)
    if status_:
        query = query.where(IngestionLog.status == status_)
    return list(session.scalars(query))


class MappingOut(BaseModel):
    id: int
    source_signature: str
    source_columns: list[str] | None
    mapping_json: dict[str, str] | None
    missing_fields: list[str] | None
    status: str
    proposed_by: str | None
    sample_file: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.get("/mappings", response_model=list[MappingOut])
def list_mappings(
    session: SessionDep, status_: Annotated[str | None, Query(alias="status")] = "pending"
) -> list[ColumnMapping]:
    query = select(ColumnMapping).order_by(desc(ColumnMapping.updated_at))
    if status_:
        query = query.where(ColumnMapping.status == status_)
    return list(session.scalars(query))


class MappingBody(BaseModel):
    """Encabezado (original o normalizado) → campo destino; "" ignora la columna.

    Una clave "=campo" fija un valor constante, p. ej. {"=type": "proyeccion"}.
    """

    mapping: dict[str, str]


def _validated_mapping(row: ColumnMapping, mapping: dict[str, str]) -> dict[str, str]:
    schema = get_schema()
    fields = {schema.routing.field} | {f for t in schema.tables.values() for f in t.columns}
    headers = {normalize_header(c) for c in row.source_columns or []}
    clean: dict[str, str] = {}
    for header, target in mapping.items():
        if header.startswith(CONSTANT_PREFIX):
            name = header.removeprefix(CONSTANT_PREFIX)
            if name not in fields or not target:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY, f"constante no válida: {header}"
                )
            if name == schema.routing.field and target not in schema.routing.tables:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"tipo no válido: {target} ({', '.join(schema.routing.tables)})",
                )
            clean[header] = target
            continue
        key = normalize_header(header)
        if key not in headers:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"columna desconocida: {header}"
            )
        if target != IGNORE and target not in fields:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"campo desconocido: {target}"
            )
        clean[key] = target
    targets = [t for h, t in clean.items() if t != IGNORE and not h.startswith(CONSTANT_PREFIX)]
    if len(targets) != len(set(targets)):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "dos columnas apuntan al mismo campo"
        )
    return clean


@router.put("/mappings/{mapping_id}/proposal", response_model=MappingOut)
def propose_mapping(session: SessionDep, mapping_id: int, body: MappingBody) -> ColumnMapping:
    """Guarda una propuesta de mapeo (la usa el flujo de IA de n8n). Queda pendiente."""
    row = session.get(ColumnMapping, mapping_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "mapeo no encontrado")
    if row.status == "confirmed":
        raise HTTPException(status.HTTP_409_CONFLICT, "el mapeo ya está confirmado")
    row.mapping_json = _validated_mapping(row, body.mapping)
    row.proposed_by = "llm"
    session.commit()
    return row


@router.post("/mappings/{mapping_id}/confirm")
def confirm_mapping(
    session: SessionDep, service: ServiceDep, mapping_id: int, body: MappingBody | None = None
) -> dict[str, Any]:
    """Confirma el mapeo (el enviado o la propuesta) y reprocesa los archivos pendientes."""
    row = session.get(ColumnMapping, mapping_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "mapeo no encontrado")
    mapping = _validated_mapping(row, body.mapping) if body else row.mapping_json
    if not mapping:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "no hay mapeo para confirmar")
    row.mapping_json = mapping
    row.status = "confirmed"
    if body:
        row.proposed_by = "user"
    session.commit()

    pending = session.scalars(
        select(IngestionLog.bronze_path)
        .where(
            IngestionLog.source_signature == row.source_signature,
            IngestionLog.status == "needs_mapping",
            IngestionLog.bronze_path.is_not(None),
        )
        .distinct()
    ).all()
    results = [asdict(service.reprocess(path)) for path in pending]
    return {"mapping_id": row.id, "status": row.status, "reprocessed": results}
