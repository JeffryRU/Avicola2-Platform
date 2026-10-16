"""Orquestación de una carga: bronze → validación → silver → gold, y registro en ingestion_log."""

from dataclasses import dataclass, field
from typing import Any

from app.core.catalog import Catalog
from app.ingest.pipeline import ParseOutcome, parse
from app.ingest.reader import UnreadableFile, read_file
from app.ingest.repository import IngestRepository, LogEntry, PendingMapping
from app.ingest.schema import IngestSchema
from app.lakehouse.store import Lakehouse
from app.lakehouse.tables import refresh_daily_demand, write_silver

MAX_RETURNED_ERRORS = 50


@dataclass
class IngestResult:
    log_id: int
    file_name: str
    status: str
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
    if o.status == "needs_mapping":
        return (
            "No se reconocieron columnas obligatorias: "
            f"{', '.join(o.missing_fields)}. Hay que confirmar el mapeo de columnas."
        )
    if o.status == "failed":
        return "No se cargó ninguna fila: revisa los errores."
    if o.status == "partial":
        return f"Se cargaron {o.rows_ok} filas; {len(o.errors)} errores."
    return f"Se cargaron {o.rows_ok} filas."


class IngestService:
    def __init__(
        self,
        lakehouse: Lakehouse,
        repo: IngestRepository,
        schema: IngestSchema,
        catalog: Catalog,
    ) -> None:
        self.lh = lakehouse
        self.repo = repo
        self.schema = schema
        self.catalog = catalog

    def ingest(
        self, content: bytes, file_name: str, source: str, table: str | None = None
    ) -> IngestResult:
        """Guarda el archivo en bronze y lo procesa."""
        bronze_path = self.lh.put_bronze(source, file_name, content)
        return self._process(content, file_name, source, bronze_path, table)

    def reprocess(
        self, bronze_path: str, source: str = "reprocess", table: str | None = None
    ) -> IngestResult:
        """Vuelve a procesar un archivo que ya está en bronze (p. ej., tras confirmar un mapeo)."""
        content = self.lh.get_bronze(bronze_path)
        file_name = bronze_path.rsplit("/", 1)[-1].split("_", 2)[-1]
        return self._process(content, file_name, source, bronze_path, table)

    def _process(
        self, content: bytes, file_name: str, source: str, bronze_path: str, table: str | None
    ) -> IngestResult:
        try:
            raw = read_file(content, file_name, self.schema.known_names())
        except UnreadableFile as exc:
            log_id = self.repo.log(
                LogEntry(
                    file_name,
                    source,
                    "failed",
                    0,
                    0,
                    [{"message": str(exc)}],
                    bronze_path,
                    None,
                    {},
                )
            )
            return IngestResult(log_id, file_name, "failed", bronze_path, message=str(exc))

        confirmed = self.repo.confirmed_mapping(raw.signature)
        outcome = parse(raw, file_name, self.schema, self.catalog, confirmed, table)

        mapping_id = None
        if outcome.status == "needs_mapping":
            mapping_id = self.repo.save_pending_mapping(
                PendingMapping(
                    raw.signature,
                    raw.source_columns,
                    outcome.mapping,
                    outcome.missing_fields,
                    file_name,
                )
            )

        tables: dict[str, Any] = {}
        affected_dates = set()
        for name, df in outcome.tables.items():
            version = write_silver(
                self.lh, name, self.schema.tables[name], df, file_name, bronze_path
            )
            tables[name] = {"rows": len(df), "version": version}
            if name == "orders":
                affected_dates |= set(df["date"])
        if affected_dates:
            gold_version = refresh_daily_demand(self.lh, affected_dates)
            tables["gold.daily_demand"] = {"dates": len(affected_dates), "version": gold_version}

        errors = [e.as_dict() for e in outcome.errors]
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
