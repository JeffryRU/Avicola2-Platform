"""Casos de uso de la ingesta alrededor de IngestService: log, mapeos y reproceso."""

from dataclasses import dataclass

from app.ingest.application.ports import IngestionLogRepository, MappingRepository
from app.ingest.application.service import IngestResult, IngestService
from app.ingest.domain.mapping import validate_mapping
from app.ingest.domain.models import LogRecord, MappingRecord
from app.ingest.domain.schema import IngestSchema
from app.shared.domain.errors import ConflictError, DomainError, NotFoundError


@dataclass(frozen=True)
class ConfirmedMapping:
    mapping_id: int
    status: str
    reprocessed: list[IngestResult]


class ReprocessFile:
    """Vuelve a procesar un archivo que ya está en bronze."""

    def __init__(self, service: IngestService) -> None:
        self.service = service

    def __call__(self, bronze_path: str, table: str | None) -> IngestResult:
        self.service.schema.require_table(table)
        try:
            return self.service.reprocess(bronze_path, table=table)
        except (ValueError, FileNotFoundError) as exc:
            raise NotFoundError(f"no existe en bronze: {bronze_path}") from exc


class ListIngestionLog:
    def __init__(self, log: IngestionLogRepository) -> None:
        self.log = log

    def __call__(self, limit: int, status: str | None) -> list[LogRecord]:
        return self.log.list_log(limit, status)


class ListMappings:
    def __init__(self, mappings: MappingRepository) -> None:
        self.mappings = mappings

    def __call__(self, status: str | None) -> list[MappingRecord]:
        return self.mappings.list_mappings(status)


def _get(mappings: MappingRepository, mapping_id: int) -> MappingRecord:
    record = mappings.get_mapping(mapping_id)
    if record is None:
        raise NotFoundError("mapeo no encontrado")
    return record


class ProposeMapping:
    """Guarda una propuesta de mapeo (la usa el flujo de IA de n8n). Queda pendiente."""

    def __init__(self, mappings: MappingRepository, schema: IngestSchema) -> None:
        self.mappings = mappings
        self.schema = schema

    def __call__(self, mapping_id: int, mapping: dict[str, str]) -> MappingRecord:
        record = _get(self.mappings, mapping_id)
        if record.status == "confirmed":
            raise ConflictError("el mapeo ya está confirmado")
        clean = validate_mapping(self.schema, record.source_columns, mapping)
        return self.mappings.update_mapping(mapping_id, clean, record.status, "llm")


class ConfirmMapping:
    """Confirma el mapeo (el enviado o la propuesta) y reprocesa los archivos pendientes."""

    def __init__(
        self, mappings: MappingRepository, log: IngestionLogRepository, service: IngestService
    ) -> None:
        self.mappings = mappings
        self.log = log
        self.service = service

    def __call__(self, mapping_id: int, mapping: dict[str, str] | None) -> ConfirmedMapping:
        record = _get(self.mappings, mapping_id)
        if mapping is not None:
            final = validate_mapping(self.service.schema, record.source_columns, mapping)
        else:
            final = record.mapping_json
        if not final:
            raise DomainError("no hay mapeo para confirmar")
        record = self.mappings.update_mapping(
            mapping_id, final, "confirmed", "user" if mapping is not None else None
        )
        pending = self.log.pending_bronze_paths(record.source_signature)
        results = [self.service.reprocess(path) for path in pending]
        return ConfirmedMapping(record.id, record.status, results)
