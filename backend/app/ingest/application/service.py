"""Orquestación de una carga: bronze → validación → silver → gold, y registro en ingestion_log.

Es la única ruta de la ingesta: endpoints y scripts la reutilizan (se arma en bootstrap.py).
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from app.ingest.application.ports import (
    AnalyticsStore,
    BronzeStore,
    FileReader,
    IngestRepository,
)
from app.ingest.domain.catalog import Catalog
from app.ingest.domain.models import (
    DAILY_DEMAND_TABLE,
    ORDERS_TABLE,
    IngestStatus,
    LogEntry,
    ParseOutcome,
    PendingMapping,
    UnreadableFileError,
)
from app.ingest.domain.pipeline import parse
from app.ingest.domain.schema import IngestSchema

logger = logging.getLogger(__name__)

MAX_RETURNED_ERRORS = 50


@dataclass
class IngestResult:
    log_id: int
    file_name: str
    status: IngestStatus
    bronze_path: str
    rows_total: int = 0
    rows_ok: int = 0
    rows_error: int = 0
    tables: dict[str, Any] = field(default_factory=dict)
    errors: list[dict[str, Any]] = field(default_factory=list)
    signature: str | None = None
    missing_fields: list[str] = field(default_factory=list)
    mapping_id: int | None = None
    message: str = ""


def _message(o: ParseOutcome) -> str:
    if o.status == IngestStatus.NEEDS_MAPPING:
        return (
            "No se reconocieron columnas obligatorias: "
            f"{', '.join(o.missing_fields)}. Hay que confirmar el mapeo de columnas."
        )
    if o.status == IngestStatus.FAILED:
        return "No se cargó ninguna fila: revisa los errores."
    if o.status == IngestStatus.PARTIAL:
        return f"Se cargaron {o.rows_ok} filas; {len(o.errors)} errores."
    return f"Se cargaron {o.rows_ok} filas."


class IngestService:
    def __init__(
        self,
        bronze: BronzeStore,
        analytics: AnalyticsStore,
        reader: FileReader,
        repo: IngestRepository,
        schema: IngestSchema,
        catalog: Catalog,
    ) -> None:
        self.bronze = bronze
        self.analytics = analytics
        self.reader = reader
        self.repo = repo
        self.schema = schema
        self.catalog = catalog

    def ingest(
        self, content: bytes, file_name: str, source: str, table: str | None = None
    ) -> IngestResult:
        """Guarda el archivo en bronze y lo procesa."""
        bronze_path = self.bronze.put_bronze(source, file_name, content)
        return self._process(content, file_name, source, bronze_path, table)

    def reprocess(
        self, bronze_path: str, source: str = "reprocess", table: str | None = None
    ) -> IngestResult:
        """Vuelve a procesar un archivo que ya está en bronze (p. ej., tras confirmar un mapeo)."""
        content = self.bronze.get_bronze(bronze_path)
        file_name = bronze_path.rsplit("/", 1)[-1].split("_", 2)[-1]
        return self._process(content, file_name, source, bronze_path, table)

    def _process(
        self, content: bytes, file_name: str, source: str, bronze_path: str, table: str | None
    ) -> IngestResult:
        try:
            raw = self.reader.read(content, file_name, self.schema.known_names())
        except UnreadableFileError as exc:
            return self._unreadable(file_name, source, bronze_path, exc)

        confirmed = self.repo.confirmed_mapping(raw.signature)
        outcome = parse(raw, file_name, self.schema, self.catalog, confirmed, table)

        mapping_id = None
        if outcome.status == IngestStatus.NEEDS_MAPPING:
            mapping_id = self.repo.save_pending_mapping(
                PendingMapping(
                    raw.signature,
                    raw.source_columns,
                    outcome.mapping,
                    outcome.missing_fields,
                    file_name,
                )
            )
        tables = self._write_tables(outcome, file_name, bronze_path)

        errors = [e.as_dict() for e in outcome.errors]
        logger.log(
            logging.INFO
            if outcome.status in (IngestStatus.OK, IngestStatus.PARTIAL)
            else logging.WARNING,
            "Carga %s (%s): %s, %d/%d filas, %d errores, tablas %s",
            file_name,
            source,
            outcome.status,
            outcome.rows_ok,
            outcome.rows_total,
            len(errors),
            sorted(tables),
        )
        log_id = self.repo.log(
            LogEntry(
                file_name,
                source,
                outcome.status,
                outcome.rows_ok,
                len(errors),
                errors,
                bronze_path,
                outcome.signature,
                tables,
            )
        )
        return IngestResult(
            log_id=log_id,
            file_name=file_name,
            status=outcome.status,
            bronze_path=bronze_path,
            rows_total=outcome.rows_total,
            rows_ok=outcome.rows_ok,
            rows_error=len(errors),
            tables=tables,
            errors=errors[:MAX_RETURNED_ERRORS],
            signature=outcome.signature,
            missing_fields=outcome.missing_fields,
            mapping_id=mapping_id,
            message=_message(outcome),
        )

    def _unreadable(
        self, file_name: str, source: str, bronze_path: str, exc: UnreadableFileError
    ) -> IngestResult:
        """El archivo no se pudo leer: queda en bronze y en el log como fallido."""
        logger.warning("Archivo ilegible %s (%s): %s", file_name, source, exc.message)
        log_id = self.repo.log(
            LogEntry(
                file_name,
                source,
                IngestStatus.FAILED,
                0,
                0,
                [{"message": exc.message}],
                bronze_path,
                None,
                {},
            )
        )
        return IngestResult(
            log_id, file_name, IngestStatus.FAILED, bronze_path, message=exc.message
        )

    def _write_tables(
        self, outcome: ParseOutcome, file_name: str, bronze_path: str
    ) -> dict[str, Any]:
        """Escribe las filas válidas en silver y recalcula gold para las fechas de pedidos.

        Devuelve, por tabla, cuántas filas o fechas se escribieron y la versión Delta.
        """
        tables: dict[str, Any] = {}
        affected_dates = set()
        for name, rows in outcome.tables.items():
            version = self.analytics.write_silver(
                name, self.schema.tables[name], rows, file_name, bronze_path
            )
            tables[name] = {"rows": len(rows), "version": version}
            if name == ORDERS_TABLE:
                affected_dates |= {row["date"] for row in rows}
        if affected_dates:
            gold_version = self.analytics.refresh_daily_demand(affected_dates)
            tables[f"gold.{DAILY_DEMAND_TABLE}"] = {
                "dates": len(affected_dates),
                "version": gold_version,
            }
        return tables
