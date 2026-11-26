"""Tablas de las respuestas del asistente (ADR 0024): del Markdown del agente a bloques.

El agente escribe las tablas como Markdown (`| a | b |` con la fila `|---|`) y, si tienen título,
`**Título**` en la línea anterior. Aquí se separan de la respuesta en bloques de texto y de tabla,
se acotan (12 columnas, 200 filas), se pasan a texto alineado (canales) y se leen sus celdas
como números cuando lo son (Excel). Python puro.
"""

import re
from typing import Any

from app.planning.domain.assistant import plain

MAX_COLUMNS = 12
MAX_ROWS = 200
_SEPARATOR_CELL = re.compile(r"^:?-+:?$")
_TITLE = re.compile(r"^\*\*(.+?)\*\*:?$")
_PIPE = "\u0000"
_THOUSANDS = re.compile(r"^-?\d{1,3}(,\d{3})+(\.\d+)?$")
_DECIMAL_COMMA = re.compile(r"^-?\d+,\d{1,2}$")
_PLAIN_NUMBER = re.compile(r"^-?\d+(\.\d+)?$")


def _cells(line: str) -> list[str]:
    inner = line.strip().replace(r"\|", _PIPE)
    if inner.startswith("|"):
        inner = inner[1:]
    if inner.endswith("|"):
        inner = inner[:-1]
    return [c.replace(_PIPE, "|").strip() for c in inner.split("|")]


def _is_row(line: str) -> bool:
    return line.strip().startswith("|")


def _is_separator(line: str) -> bool:
    if not _is_row(line):
        return False
    cells = _cells(line)
    return bool(cells) and all(_SEPARATOR_CELL.match(c) for c in cells)


def split_blocks(text: str) -> list[dict[str, Any]]:
    """La respuesta en bloques `{"type": "text", "text"}` y `{"type": "table", "title",
    "columns", "rows"}`. Sin tablas, un solo bloque de texto (o ninguno si está vacía)."""
    lines = text.splitlines()
    blocks: list[dict[str, Any]] = []
    pending: list[str] = []

    def flush() -> None:
        body = "\n".join(pending).strip()
        pending.clear()
        if body:
            blocks.append({"type": "text", "text": body})

    i = 0
    while i < len(lines):
        if _is_row(lines[i]) and i + 1 < len(lines) and _is_separator(lines[i + 1]):
            title = None
            if pending and (found := _TITLE.match(pending[-1].strip())):
                title = found.group(1).strip()
                pending.pop()
            flush()
            columns = _cells(lines[i])
            rows: list[list[str]] = []
            i += 2
            while i < len(lines) and _is_row(lines[i]):
                rows.append(_cells(lines[i]))
                i += 1
            notice = _limit(columns, rows)
            width = len(columns)
            rows = [(r + [""] * width)[:width] for r in rows]
            blocks.append({"type": "table", "title": title, "columns": columns, "rows": rows})
            if notice:
                label = f" «{title}»" if title else ""
                blocks.append({"type": "text", "text": f"La tabla{label} {notice}"})
            continue
        pending.append(lines[i])
        i += 1
    flush()
    return blocks


def _limit(columns: list[str], rows: list[list[str]]) -> str:
    """Recorta en el lugar y dice qué se recortó (cadena vacía si nada)."""
    cut = []
    if len(columns) > MAX_COLUMNS:
        del columns[MAX_COLUMNS:]
        cut.append(f"{MAX_COLUMNS} columnas")
    if len(rows) > MAX_ROWS:
        del rows[MAX_ROWS:]
        cut.append(f"{MAX_ROWS} filas")
    return f"se recortó a {' y '.join(cut)}." if cut else ""


def tables_of(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Solo las tablas, en orden (el índice de la descarga es la posición aquí)."""
    return [b for b in blocks if b.get("type") == "table"]


def cell_value(text: str) -> int | float | str:
    """La celda como número si lo es (`2340`, `1,234.5`, `1,5`); si no, el texto tal cual."""
    raw = text.strip()
    if _THOUSANDS.match(raw):
        raw = raw.replace(",", "")
    elif _DECIMAL_COMMA.match(raw):
        raw = raw.replace(",", ".")
    if not _PLAIN_NUMBER.match(raw):
        return text
    unsigned = raw.lstrip("-")
    # «007» es un código, no un número.
    if len(unsigned) > 1 and unsigned.startswith("0") and not unsigned.startswith("0."):
        return text
    return float(raw) if "." in raw else int(raw)


def table_as_text(columns: list[str], rows: list[list[str]], title: str | None = None) -> str:
    """Tabla alineada para un chat: bloque monoespaciado (``` ... ```), con el título arriba."""
    widths = [len(c) for c in columns]
    for row in rows:
        widths = [max(w, len(cell)) for w, cell in zip(widths, row, strict=False)]

    def line(cells: list[str]) -> str:
        padded = []
        for cell, width in zip(cells, widths, strict=False):
            numeric = isinstance(cell_value(cell), int | float)
            padded.append(cell.rjust(width) if numeric else cell.ljust(width))
        return " | ".join(padded).rstrip()

    body = [line(columns), "-+-".join("-" * w for w in widths), *(line(r) for r in rows)]
    head = f"*{title}*\n" if title else ""
    return head + "```\n" + "\n".join(body) + "\n```"


_BOLD = re.compile(r"\*\*(.+?)\*\*")
_HEADING = re.compile(r"^#{1,6}\s+", re.MULTILINE)


def chat_text(text: str) -> str:
    """Markdown del agente en el que los chats sí muestran: `**negrita**` → `*negrita*`, sin `#`."""
    return _BOLD.sub(r"*\1*", _HEADING.sub("", text))


def file_slug(title: str) -> str:
    """Nombre de archivo a partir del título: minúsculas, sin tildes y con guiones."""
    slug = re.sub(r"[^a-z0-9]+", "-", plain(title)).strip("-")
    return slug[:60] or "tabla"
