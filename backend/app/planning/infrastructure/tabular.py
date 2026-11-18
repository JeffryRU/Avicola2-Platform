"""Lectura de CSV y Excel para las cargas: encuentra la fila de títulos de cada archivo
declarado en imports.yaml y entrega sus filas ya validadas."""

import csv
import io
from collections.abc import Iterable, Iterator, Sequence
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

from app.planning.domain.file_specs import FileSpec, RowError, RowIssues

Cells = Sequence[Any]
# Archivo reconocido: su especificación, la posición de cada campo, las filas y en qué fila
# del archivo estaban los títulos (para numerar las filas en los mensajes).
Found = tuple[FileSpec, dict[str, int], Iterator[Cells], int]


def decode(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("latin-1")


def csv_rows(text: str) -> Iterator[list[str]]:
    sample = text[:4096]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    return csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)


def open_workbook(source: bytes | Path):
    """Excel en modo lectura (quien lo abre lo cierra con `.close()`)."""
    return load_workbook(
        io.BytesIO(source) if isinstance(source, bytes) else source,
        read_only=True,
        data_only=True,
    )


def match(rows: Iterator[Cells], specs: Iterable[FileSpec]) -> Found | None:
    """Busca la fila de títulos en las primeras filas (puede haber un título arriba)."""
    specs = list(specs)
    scan = max((s.header_scan for s in specs), default=0)
    for line in range(1, scan + 1):
        header = next(rows, None)
        if header is None:
            return None
        for spec in specs:
            positions = spec.locate(header)
            if positions is not None:
                return spec, positions, rows, line
    return None


def records(found: Found, issues: RowIssues) -> Iterator[dict[str, Any]]:
    """Las filas convertidas; las que traen un valor inválido van a `issues`."""
    spec, positions, rows, header_line = found
    for line, cells in enumerate(rows, start=header_line + 1):
        if not cells or all(c is None or str(c).strip() == "" for c in cells):
            continue
        try:
            row = spec.convert(cells, positions)
        except RowError as error:
            issues.add(line, error)
            continue
        if row is not None:
            yield row
