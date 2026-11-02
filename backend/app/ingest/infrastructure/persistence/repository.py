"""Persistencia de la ingesta en la base de la app (ingestion_log y column_mappings).

Implementa los puertos IngestRepository, IngestionLogRepository y MappingRepository con
SQLAlchemy; el motor sale de DATABASE_URL (shared/infrastructure/database).
"""

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.models import ColumnMapping, IngestionLog
from app.ingest.domain.models import LogEntry, LogRecord, MappingRecord, PendingMapping


def _log_record(row: IngestionLog) -> LogRecord:
    return LogRecord(
        id=row.id,
        created_at=row.created_at,
        file_name=row.file_name,
        source=row.source,
        status=row.status,
        rows_ok=row.rows_ok,
        rows_error=row.rows_error,
        bronze_path=row.bronze_path,
        source_signature=row.source_signature,
        tables_json=row.tables_json,
        errors_json=row.errors_json,
    )


def _mapping_record(row: ColumnMapping) -> MappingRecord:
    return MappingRecord(
        id=row.id,
        source_signature=row.source_signature,
        source_columns=row.source_columns,
        mapping_json=row.mapping_json,
        missing_fields=row.missing_fields,
        status=row.status,
        proposed_by=row.proposed_by,
        sample_file=row.sample_file,
        updated_at=row.updated_at,
    )


class SqlIngestRepository:
    MAX_LOGGED_ERRORS = 500

    def __init__(self, session: Session) -> None:
        self.session = session

    # --- IngestRepository ----------------------------------------------------------
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

    # --- IngestionLogRepository ----------------------------------------------------
    def list_log(self, limit: int, status: str | None) -> list[LogRecord]:
        query = select(IngestionLog).order_by(desc(IngestionLog.id)).limit(limit)
        if status:
            query = query.where(IngestionLog.status == status)
        return [_log_record(row) for row in self.session.scalars(query)]

    def pending_bronze_paths(self, signature: str) -> list[str]:
        return list(
            self.session.scalars(
                select(IngestionLog.bronze_path)
                .where(
                    IngestionLog.source_signature == signature,
                    IngestionLog.status == "needs_mapping",
                    IngestionLog.bronze_path.is_not(None),
                )
                .distinct()
            ).all()
        )

    # --- MappingRepository ---------------------------------------------------------
    def list_mappings(self, status: str | None) -> list[MappingRecord]:
        query = select(ColumnMapping).order_by(desc(ColumnMapping.updated_at))
        if status:
            query = query.where(ColumnMapping.status == status)
        return [_mapping_record(row) for row in self.session.scalars(query)]

    def get_mapping(self, mapping_id: int) -> MappingRecord | None:
        row = self.session.get(ColumnMapping, mapping_id)
        return _mapping_record(row) if row else None

    def update_mapping(
        self, mapping_id: int, mapping: dict[str, str], status: str, proposed_by: str | None
    ) -> MappingRecord:
        row = self.session.get_one(ColumnMapping, mapping_id)
        row.mapping_json = mapping
        row.status = status
        if proposed_by is not None:
            row.proposed_by = proposed_by
        self.session.commit()
        return _mapping_record(row)
