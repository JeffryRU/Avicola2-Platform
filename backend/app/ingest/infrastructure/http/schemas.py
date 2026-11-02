"""Modelos de entrada y salida de la API de ingesta (contrato que usa n8n)."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class TransformRequest(BaseModel):
    bronze_path: str
    table: str | None = None


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


class MappingBody(BaseModel):
    """Encabezado (original o normalizado) → campo destino; "" ignora la columna.

    Una clave "=campo" fija un valor constante, p. ej. {"=type": "proyeccion"}.
    """

    mapping: dict[str, str]
