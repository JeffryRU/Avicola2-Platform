"""Mapeo de columnas, validación por fila y reparto en tablas silver.

Es lógica pura (sin base de datos, lakehouse ni pandas), para poder probarla con los Excel de
ejemplo. Orden de mapeo: alias del YAML → mapeo confirmado (column_mappings) → pendiente para
el LLM.
"""

from pathlib import PurePath
from typing import Any

from app.ingest.domain.catalog import Catalog
from app.ingest.domain.mapping import IGNORE, split_mapping
from app.ingest.domain.models import ParseOutcome, RawTable, Row, RowError
from app.ingest.domain.normalize import (
    CellError,
    is_blank,
    normalize_header,
    normalize_key,
    parse_date,
    parse_number,
)
from app.ingest.domain.schema import ColumnSpec, IngestSchema, TableSpec


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


def _sum(values: list[Any]) -> Any:
    """Suma que ignora vacíos, con la misma compensación de Kahan que `groupby.sum` de pandas."""
    total: Any = 0
    compensation: Any = 0
    for value in values:
        if value is None:
            continue
        y = value - compensation
        t = total + y
        compensation = t - total - y
        if compensation != compensation:  # NaN (con infinitos)
            compensation = 0
        total = t
    return total


def _first(values: list[Any]) -> Any:
    return next((v for v in values if v is not None), None)


def _aggregate(rows: list[Row], spec: TableSpec) -> list[Row]:
    """Si el archivo repite una clave, suma las cantidades y conserva el primer valor del resto."""
    groups: dict[tuple[Any, ...], list[Row]] = {}
    for row in rows:
        groups.setdefault(tuple(row[k] for k in spec.merge_keys), []).append(row)
    if len(groups) == len(rows):
        return rows
    merged: list[Row] = []
    for group in groups.values():
        out: Row = {}
        for name, col in spec.columns.items():
            values = [r[name] for r in group]
            if name in spec.merge_keys:
                out[name] = values[0]
            elif col.type in ("float", "int"):
                out[name] = _sum(values)
            else:
                out[name] = _first(values)
        merged.append(out)
    return merged


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
    headers = list(raw.columns)
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
    rows: dict[str, list[Row]] = {t: [] for t in targets}

    for i, record in enumerate(raw.rows):
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

        clean: Row = {}
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
            outcome.tables[name] = _aggregate(records, schema.tables[name])

    if outcome.rows_ok == 0:
        outcome.status = "failed"
    elif outcome.errors:
        outcome.status = "partial"
    return outcome
