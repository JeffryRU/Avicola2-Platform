"""Mapeo de columnas, validación por fila y reparto en tablas silver.

Es lógica pura (sin base de datos ni lakehouse), para poder probarla con los Excel de ejemplo.
Orden de mapeo: alias del YAML → mapeo confirmado (column_mappings) → pendiente para el LLM.
"""

from dataclasses import dataclass, field
from pathlib import PurePath
from typing import Any, Literal

import pandas as pd

from app.core.catalog import Catalog
from app.ingest.normalize import (
    CellError,
    is_blank,
    normalize_header,
    normalize_key,
    parse_date,
    parse_number,
)
from app.ingest.reader import RawTable
from app.ingest.schema import ColumnSpec, IngestSchema, TableSpec

Status = Literal["ok", "partial", "failed", "needs_mapping"]
IGNORE = ""  # en un mapeo confirmado, la columna se ignora
# En un mapeo, una clave "=campo" fija un valor constante para todo el archivo,
# p. ej. {"=type": "proyeccion"} para un Excel de proyecciones sin columna tipo.
CONSTANT_PREFIX = "="


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
    tables: dict[str, pd.DataFrame] = field(default_factory=dict)
    errors: list[RowError] = field(default_factory=list)
    rows_total: int = 0
    rows_ok: int = 0


def channel_from_filename(filename: str, catalog: Catalog) -> str | None:
    """Canal según `{canal}_{responsable}_{AAAAMMDD}.xlsx`, si está en el catálogo."""
    first = PurePath(filename).stem.split("_")[0]
    by_key = {normalize_key(c): c for c in catalog.channels}
    return by_key.get(normalize_key(first))


def auto_mapping(headers: list[str], schema: IngestSchema, tables: list[str]) -> dict[str, str]:
    """Mapea encabezados normalizados a campos usando nombres y alias del YAML."""
    index: dict[str, str] = {}
    for name in [schema.routing.field, *schema.routing.aliases]:
        index[normalize_header(name)] = schema.routing.field
    for table in tables:
        for name, target in schema.tables[table].alias_index().items():
            index.setdefault(name, target)
    mapping: dict[str, str] = {}
    for header in headers:
        target = index.get(header)
        if target and target not in mapping.values():
            mapping[header] = target
    return mapping


def split_mapping(mapping: dict[str, str]) -> tuple[dict[str, str], dict[str, str]]:
    """Separa un mapeo en {encabezado: campo} y {campo: valor constante}."""
    columns = {h: t for h, t in mapping.items() if not h.startswith(CONSTANT_PREFIX)}
    constants = {
        h.removeprefix(CONSTANT_PREFIX): v
        for h, v in mapping.items()
        if h.startswith(CONSTANT_PREFIX)
    }
    return columns, constants


def _route(schema: IngestSchema, value: str) -> str | None:
    routes = {normalize_key(k): v for k, v in schema.routing.tables.items()}
    return routes.get(normalize_key(value))


def _target_tables(
    schema: IngestSchema, table: str | None, mapping: dict[str, str], constants: dict[str, str]
) -> list[str]:
    if table:
        return [table]
    if schema.routing.field in mapping.values():
        return schema.routed_tables()
    constant = constants.get(schema.routing.field)
    if constant and _route(schema, constant):
        return [_route(schema, constant)]
    return [schema.routing.tables[schema.routing.default]]


def _missing_required(
    specs: list[TableSpec],
    mapping: dict[str, str],
    constants: dict[str, str],
    filename_channel: str | None,
) -> list[str]:
    mapped = set(mapping.values()) | set(constants)
    missing: list[str] = []
    for spec in specs:
        for name, col in spec.columns.items():
            if not col.required or name in mapped or col.default is not None:
                continue
            if col.from_filename and filename_channel:
                continue
            if name not in missing:
                missing.append(name)
    return missing


def _convert(label: str, col: ColumnSpec, value: Any, catalog: Catalog) -> Any:
    if col.type == "date":
        return parse_date(value)
    if col.type in ("float", "int"):
        number = parse_number(value)
        if col.min is not None and number < col.min:
            raise CellError(f"{label} debe ser ≥ {col.min:g}, llegó {number:g}")
        if col.type == "int":
            if not number.is_integer():
                raise CellError(f"{label} debe ser entero, llegó {number:g}")
            return int(number)
        return number
    text = str(value).strip()
    options = getattr(catalog, col.catalog) if col.catalog else col.allowed
    if options is not None:
        if col.default is not None and text == col.default:
            return text
        by_key = {normalize_key(o): o for o in options}
        match = by_key.get(normalize_key(text))
        if match is None:
            raise CellError(f"{text!r} no está en la lista de {label} ({', '.join(options)})")
        return match
    return text


def _aggregate(df: pd.DataFrame, spec: TableSpec) -> pd.DataFrame:
    """Si el archivo repite una clave, suma las cantidades y conserva el primer valor del resto."""
    if not df.duplicated(spec.merge_keys).any():
        return df
    agg = {
        c: ("sum" if spec.columns[c].type in ("float", "int") else "first")
        for c in df.columns
        if c not in spec.merge_keys
    }
    return df.groupby(spec.merge_keys, as_index=False, sort=False, dropna=False).agg(agg)[
        list(df.columns)
    ]


def parse(
    raw: RawTable,
    filename: str,
    schema: IngestSchema,
    catalog: Catalog,
    confirmed_mapping: dict[str, str] | None = None,
    table: str | None = None,
) -> ParseOutcome:
    """Convierte la tabla cruda en DataFrames validados por tabla silver."""
    if table is not None and table not in schema.tables:
        raise ValueError(f"tabla desconocida: {table}")
    headers = list(raw.df.columns)
    candidate_tables = [table] if table else schema.routed_tables()
    mapping = auto_mapping(headers, schema, candidate_tables)
    confirmed_columns, constants = split_mapping(confirmed_mapping or {})
    if confirmed_columns:
        for header, target in confirmed_columns.items():
            if header not in headers:
                continue
            mapping = {h: t for h, t in mapping.items() if t != target or h == header}
            if target == IGNORE:
                mapping.pop(header, None)
            else:
                mapping[header] = target

    filename_channel = channel_from_filename(filename, catalog)
    targets = _target_tables(schema, table, mapping, constants)
    outcome = ParseOutcome("ok", raw.signature, raw.source_columns, mapping)
    outcome.missing_fields = _missing_required(
        [schema.tables[t] for t in targets], mapping, constants, filename_channel
    )
    if outcome.missing_fields:
        outcome.status = "needs_mapping"
        return outcome

    header_of = {target: header for header, target in mapping.items()}
    rows: dict[str, list[dict[str, Any]]] = {t: [] for t in targets}

    for i, record in enumerate(raw.df.to_dict("records")):
        if all(is_blank(v) for v in record.values()):
            continue
        outcome.rows_total += 1
        excel_row = raw.excel_row(i)
        errors: list[RowError] = []

        target = table
        if target is None:
            route_header = header_of.get(schema.routing.field)
            route_value = (
                record.get(route_header) if route_header else constants.get(schema.routing.field)
            )
            if is_blank(route_value):
                target = schema.routing.tables[schema.routing.default]
            else:
                target = _route(schema, str(route_value))
                if target is None:
                    errors.append(
                        RowError(
                            excel_row,
                            raw.display_name(route_header) if route_header else "tipo",
                            route_value,
                            f"tipo no válido ({', '.join(schema.routing.tables)})",
                        )
                    )

        clean: dict[str, Any] = {}
        if target is not None:
            for name, col in schema.tables[target].columns.items():
                header = header_of.get(name)
                label = raw.display_name(header) if header else name
                if header is None:
                    if name in constants:
                        value = constants[name]
                    elif col.from_filename:
                        value = filename_channel
                    else:
                        value = col.default
                else:
                    value = record.get(header)
                    if is_blank(value):
                        value = col.default
                if is_blank(value):
                    if col.required:
                        errors.append(RowError(excel_row, label, None, f"falta {label}"))
                    clean[name] = None
                    continue
                try:
                    clean[name] = _convert(label, col, value, catalog)
                except CellError as exc:
                    errors.append(RowError(excel_row, label, value, str(exc)))

        if errors:
            outcome.errors.extend(errors)
            continue
        rows[target].append(clean)
        outcome.rows_ok += 1

    for name, records in rows.items():
        if records:
            spec = schema.tables[name]
            df = pd.DataFrame.from_records(records, columns=list(spec.columns))
            outcome.tables[name] = _aggregate(df, spec)

    if outcome.rows_ok == 0:
        outcome.status = "failed"
    elif outcome.errors:
        outcome.status = "partial"
    return outcome
