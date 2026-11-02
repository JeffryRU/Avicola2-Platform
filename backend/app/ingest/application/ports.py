"""Puertos de salida: lo que la ingesta necesita del exterior.

Los adaptadores de infrastructure/ los implementan; la aplicación nunca los importa.
"""

from collections.abc import Iterable
from datetime import date
from typing import Protocol

from app.ingest.domain.models import (
    LogEntry,
    LogRecord,
    MappingRecord,
    PendingMapping,
    RawTable,
    Row,
)
from app.ingest.domain.schema import TableSpec


class FileReader(Protocol):
    def read(self, content: bytes, filename: str, known: set[str]) -> RawTable:
        """Elige la hoja y la fila de encabezado más probables. Lanza UnreadableFile."""
        ...


class BronzeStore(Protocol):
    """Archivos crudos tal como llegaron (bronze del lakehouse)."""

    def put_bronze(self, source: str, filename: str, content: bytes) -> str:
        """Guarda el archivo y devuelve su clave. Nunca sobrescribe."""
        ...

    def get_bronze(self, key: str) -> bytes:
        """Lanza ValueError si la clave no es de bronze y FileNotFoundError si no existe."""
        ...


class AnalyticsStore(Protocol):
    """Tablas silver y gold del lakehouse (escrituras con merge por clave natural)."""

    def write_silver(
        self, table: str, spec: TableSpec, rows: list[Row], source_file: str, source_ref: str
    ) -> int:
        """Upsert de filas validadas. Devuelve la versión resultante."""
        ...

    def refresh_daily_demand(self, dates: Iterable[date]) -> int | None:
        """Recalcula la demanda diaria de gold para esas fechas. Devuelve la versión."""
        ...


class IngestRepository(Protocol):
    """Lo que IngestService registra en la base de la app."""

    def confirmed_mapping(self, signature: str) -> dict[str, str] | None: ...
    def save_pending_mapping(self, pending: PendingMapping) -> int: ...
    def log(self, entry: LogEntry) -> int: ...


class IngestionLogRepository(Protocol):
    def list_log(self, limit: int, status: str | None) -> list[LogRecord]: ...

    def pending_bronze_paths(self, signature: str) -> list[str]:
        """Archivos en bronze que quedaron esperando un mapeo con esa firma."""
        ...


class MappingRepository(Protocol):
    def list_mappings(self, status: str | None) -> list[MappingRecord]: ...
    def get_mapping(self, mapping_id: int) -> MappingRecord | None: ...

    def update_mapping(
        self, mapping_id: int, mapping: dict[str, str], status: str, proposed_by: str | None
    ) -> MappingRecord:
        """Guarda el mapeo, el estado y quién lo propuso (None = no cambia)."""
        ...
