"""Persistencia de la ingesta en la base de la app (ingestion_log y column_mappings)."""

from dataclasses import dataclass
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ColumnMapping, IngestionLog


@dataclass
class LogEntry:
    file_name: str
    source: str
    status: str
    rows_ok: int
    rows_error: int
    errors: list[dict[str, Any]]
    bronze_path: str | None
    signature: str | None
    tables: dict[str, Any]


@dataclass
class PendingMapping:
    signature: str
    source_columns: list[str]
    proposal: dict[str, str]
    missing_fields: list[str]
    sample_file: str


class IngestRepository(Protocol):
    def confirmed_mapping(self, signature: str) -> dict[str, str] | None: ...
    def save_pending_mapping(self, pending: PendingMapping) -> int: ...
    def log(self, entry: LogEntry) -> int: ...


class SqlIngestRepository:
    """Implementación con SQLAlchemy (Supabase / Postgres)."""

    MAX_LOGGED_ERRORS = 500

    def __init__(self, session: Session) -> None:
        self.session = session

    def confirmed_mapping(self, signature: str) -> dict[str, str] | None:
        row = self.session.scalar(
            select(ColumnMapping).where(
                ColumnMapping.source_signature == signature, ColumnMapping.status == "confirmed"
            )
        )
        return row.mapping_json if row else None

    def save_pending_mapping(self, pending: PendingMapping) -> int:
        row = self.session.scalar(
            select(ColumnMapping).where(ColumnMapping.source_signature == pending.signature)
        )
        if row is None:
            row = ColumnMapping(source_signature=pending.signature)
            self.session.add(row)
        if row.status != "confirmed":
            row.status = "pending"
            row.source_columns = pending.source_columns
            row.missing_fields = pending.missing_fields
            row.sample_file = pending.sample_file
            # No pisar una propuesta del LLM con la automática (que es más pobre).
            if row.proposed_by in (None, "alias"):
                row.mapping_json = pending.proposal
                row.proposed_by = "alias"
        self.session.commit()
        return row.id

    def log(self, entry: LogEntry) -> int:
        row = IngestionLog(
            file_name=entry.file_name[:255],
            source=entry.source,
            status=entry.status,
            rows_ok=entry.rows_ok,
            rows_error=entry.rows_error,
            errors_json=entry.errors[: self.MAX_LOGGED_ERRORS] or None,
            bronze_path=entry.bronze_path,
            source_signature=entry.signature,
            tables_json=entry.tables or None,
        )
        self.session.add(row)
        self.session.commit()
        return row.id
