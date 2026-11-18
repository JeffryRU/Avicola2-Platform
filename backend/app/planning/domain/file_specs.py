"""Qué archivos acepta la app y cómo se validan (modelo de backend/config/imports.yaml).

Cada archivo (export de ARIS, reporte de tiendas, producción) declara sus columnas: de qué
columna del archivo sale cada campo, su tipo, si es obligatoria y sus alias. Con eso se reconoce
el archivo por sus títulos, se dice qué columna falta y se convierte cada fila con un mensaje
claro si un valor no sirve. Python puro: la lectura del YAML y de los archivos va en
infrastructure/.
"""

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Literal

from app.shared.domain.errors import DomainError

ColumnType = Literal["string", "int", "float", "date"]
_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
_DMY = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})")
# Cuántos problemas de filas se informan (el resto solo se cuenta).
MAX_ISSUES = 5
# Errores de fórmula de Excel: la celda no tiene dato (se trata como vacía).
EXCEL_ERRORS = frozenset(
    {"#VALUE!", "#N/A", "#DIV/0!", "#REF!", "#NAME?", "#NUM!", "#NULL!", "#SPILL!", "#CALC!"}
)


def header_key(value: Any) -> str:
    """Título comparable: sin tildes, en minúsculas, solo letras y números.

    «COD. PEDIDO» → «codpedido».
    """
    plain = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", plain.lower())


class RowError(ValueError):
    """Una fila con un valor que no se puede usar; el mensaje se muestra al usuario."""


@dataclass(frozen=True)
class ColumnSpec:
    # Título de la columna en el archivo.
    source: str
    type: ColumnType = "string"
    # La columna debe estar en el archivo (si falta, el archivo se rechaza diciendo cuál).
    required: bool = True
    # Celda vacía: None (si no, «» en texto; en números, `default`; en fechas, error).
    nullable: bool = False
    default: float | None = None
    aliases: tuple[str, ...] = ()

    def names(self) -> list[str]:
        return [header_key(n) for n in (self.source, *self.aliases)]

    def parse(self, value: Any) -> Any:
        if isinstance(value, float) and value.is_integer():
            value = int(value)  # Excel guarda los códigos como número: 100.0 → «100»
        text = "" if value is None else str(value).strip()
        if text.upper() == "NULL" or text.upper() in EXCEL_ERRORS:
            text, value = "", None
        if self.type == "string":
            return (text or None) if self.nullable else text
        if value is None or text == "":
            if self.nullable:
                return None
            if self.type != "date" and self.default is not None:
                return self.default
            raise RowError(f"«{self.source}» está vacía")
        if self.type == "date":
            return _date(value, text, self.source)
        number = _number(value, text, self.source)
        if self.type == "int":
            if not float(number).is_integer():
                raise RowError(f"«{self.source}» no es un número entero: {text}")
            return int(number)
        return float(number)


def _date(value: Any, text: str, name: str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if found := _ISO.match(text):
        y, m, d = found.groups()
    elif found := _DMY.match(text):
        d, m, y = found.groups()
    else:
        raise RowError(f"«{name}» no es una fecha: {text}")
    try:
        return date(int(y), int(m), int(d))
    except ValueError as exc:
        raise RowError(f"«{name}» no es una fecha: {text}") from exc


def _number(value: Any, text: str, name: str) -> float:
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    clean = text.replace(" ", "")
    # «1,5» lleva coma decimal; en «1,250.5» la coma separa los miles.
    decimal_comma = "," in clean and "." not in clean
    clean = clean.replace(",", ".") if decimal_comma else clean.replace(",", "")
    try:
        return float(clean)
    except ValueError as exc:
        raise RowError(f"«{name}» no es un número: {text}") from exc


@dataclass(frozen=True)
class KeepIf:
    """Solo se toman las filas cuyo campo contiene todos estos textos (sin mirar mayúsculas)."""

    field: str
    contains: tuple[str, ...]


@dataclass(frozen=True)
class FileSpec:
    key: str
    label: str
    # Para qué se usa en la app (catálogo de datos por módulo).
    used_by: tuple[str, ...]
    columns: dict[str, ColumnSpec]
    # Campos cuyas columnas identifican el archivo (el resto se valida después).
    detect: tuple[str, ...]
    # Por dónde llega: «aris» = la carga de la app, Drive, Telegram y WhatsApp.
    upload: str | None = None
    sheet: str | None = None
    table: str | None = None
    date_field: str | None = None
    # Campo que identifica la línea: el export la repite y se guarda una vez.
    unique: str | None = None
    keep_if: tuple[KeepIf, ...] = ()
    description: str = ""
    header_scan: int = 20

    def __post_init__(self) -> None:
        known = set(self.columns)
        used = {*self.detect, *(k.field for k in self.keep_if)}
        used |= {f for f in (self.date_field, self.unique) if f}
        if unknown := used - known:
            raise ValueError(f"{self.key}: campos sin columna definida: {sorted(unknown)}")

    def locate(self, header: Sequence[Any]) -> dict[str, int] | None:
        """Posición de cada campo en la fila de títulos, o None si no es este archivo.

        Si es este archivo pero le falta una columna obligatoria, lo dice (DomainError)."""
        positions: dict[str, int] = {}
        for i, title in enumerate(header):
            key = header_key(title)
            if not key:
                continue
            for name, spec in self.columns.items():
                if name not in positions and key in spec.names():
                    positions[name] = i
        if not all(f in positions for f in self.detect):
            return None
        missing = [s.source for n, s in self.columns.items() if s.required and n not in positions]
        if missing:
            raise DomainError(
                f"Al archivo de {self.label} le falta: {', '.join(missing)}. "
                "Revisa que sea el export completo (con todas las columnas)."
            )
        return positions

    def convert(self, cells: Sequence[Any], positions: dict[str, int]) -> dict[str, Any] | None:
        """La fila con sus campos ya convertidos; None si no pasa `keep_if`. RowError si un
        valor no sirve."""
        row: dict[str, Any] = {}
        for name, spec in self.columns.items():
            at = positions.get(name)
            row[name] = spec.parse(cells[at] if at is not None and at < len(cells) else None)
        for rule in self.keep_if:
            text = str(row[rule.field] or "").upper()
            if not all(part.upper() in text for part in rule.contains):
                return None
        return row


@dataclass
class RowIssues:
    """Filas descartadas de un archivo: cuántas y las primeras, con su número de fila."""

    count: int = 0
    samples: list[str] = field(default_factory=list)

    def add(self, line: int, error: RowError) -> None:
        self.count += 1
        if len(self.samples) < MAX_ISSUES:
            self.samples.append(f"Fila {line}: {error}")
