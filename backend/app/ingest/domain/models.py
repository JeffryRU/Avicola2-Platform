"""Entidades de la ingesta: tabla cruda, resultado del parseo y registros de log y mapeo."""

import hashlib
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

from app.shared.domain.errors import DomainError

Status = Literal["ok", "partial", "failed", "needs_mapping"]
Row = dict[str, Any]


class UnreadableFileError(DomainError):
    """El archivo no se puede leer como Excel o CSV."""


@dataclass
class RawTable:
    """Datos crudos de la hoja elegida, con encabezados normalizados."""

    columns: list[str]  # encabezados normalizados (claves de cada fila)
    source_columns: list[str]  # encabezados tal como venían
    rows: list[Row]  # valores sin convertir (None = celda vacía)
    sheet: str | None
    header_row: int  # índice 0 de la fila de encabezado en la hoja

    def display_name(self, header: str) -> str:
        """Encabezado original (como lo escribió el usuario) a partir del normalizado."""
        return dict(zip(self.columns, self.source_columns, strict=True)).get(header, header)

    @property
    def signature(self) -> str:
        """Firma del conjunto de columnas, para reutilizar mapeos confirmados."""
        key = "|".join(sorted(self.columns))
        return hashlib.sha1(key.encode(), usedforsecurity=False).hexdigest()[:16]

    def excel_row(self, index: int) -> int:
        """Número de fila (1-based, como lo ve el usuario en Excel) de la fila `index`."""
        return self.header_row + 2 + index


@dataclass
class RowError:
    row: int
    column: str | None
    value: Any
    message: str

    def as_dict(self) -> dict[str, Any]:
        value = self.value if isinstance(self.value, str | int | float | None) else str(self.value)
        return {"row": self.row, "column": self.column, "value": value, "message": self.message}


@dataclass
class ParseOutcome:
    status: Status
    signature: str
    source_columns: list[str]
    mapping: dict[str, str]  # encabezado normalizado → campo
    missing_fields: list[str] = field(default_factory=list)
    tables: dict[str, list[Row]] = field(default_factory=dict)  # filas validadas por tabla
    errors: list[RowError] = field(default_factory=list)
    rows_total: int = 0
    rows_ok: int = 0


@dataclass
class LogEntry:
    """Una carga, tal como se registra en ingestion_log."""

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


@dataclass(frozen=True)
class LogRecord:
    """Fila guardada de ingestion_log."""

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


@dataclass(frozen=True)
class MappingRecord:
    """Fila guardada de column_mappings (pendiente o confirmada)."""

    id: int
    source_signature: str
    source_columns: list[str] | None
    mapping_json: dict[str, str] | None
    missing_fields: list[str] | None
    status: str  # pending | confirmed
    proposed_by: str | None  # alias | llm | user
    sample_file: str | None
    updated_at: datetime
