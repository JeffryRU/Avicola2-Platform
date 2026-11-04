"""Normalización de encabezados y valores que llegan en Excel heterogéneos."""

import math
import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any

_EXCEL_EPOCH = date(1899, 12, 30)
# Números que se leen como fecha serial de Excel (de 1954 a 2119, aprox.).
_EXCEL_SERIAL_MIN, _EXCEL_SERIAL_MAX = 20000, 80000


class CellError(ValueError):
    """Error al convertir una celda; el mensaje se muestra al usuario."""


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def normalize_header(value: Any) -> str:
    """'Peso neto (kg)' → 'peso_neto_kg', 'Fecha Pedido' → 'fecha_pedido'."""
    text = strip_accents(str(value)).lower()
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def normalize_key(value: str) -> str:
    """Clave para comparar valores de catálogo: sin tildes, minúsculas y espacios simples."""
    return re.sub(r"\s+", " ", strip_accents(value).casefold()).strip()


def is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    # NaN y NaT (de pandas) son los únicos valores distintos de sí mismos.
    try:
        return bool(value != value)  # noqa: PLR0124 (NaN y NaT)
    except TypeError:  # valores sin comparación booleana (p. ej. pd.NA): no se tratan como vacíos
        return False


def parse_date(value: Any) -> date:
    if isinstance(value, datetime):  # incluye pd.Timestamp, que hereda de datetime
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, int | float) and _EXCEL_SERIAL_MIN <= value <= _EXCEL_SERIAL_MAX:
        return _EXCEL_EPOCH + timedelta(days=int(value))
    if isinstance(value, str):
        text = value.strip()
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%Y/%m/%d"):
            try:
                parsed = datetime.strptime(text[:10] if fmt == "%Y-%m-%d" else text, fmt)  # noqa: DTZ007
                return parsed.date()  # solo la fecha: la zona horaria no aplica
            except ValueError:
                continue
    raise CellError(f"fecha no válida: {value!r}")


def parse_number(value: Any) -> float:
    """Acepta números y textos como '1.234,5', '1,234.5', '12,5' o '  80 '."""
    if isinstance(value, bool):
        raise CellError(f"número no válido: {value!r}")
    if isinstance(value, int | float):
        if math.isnan(value):
            raise CellError("número vacío")
        return float(value)
    if isinstance(value, str):
        text = value.strip().replace(" ", "").replace("\u00a0", "")
        if "," in text and "." in text:
            decimal = "," if text.rfind(",") > text.rfind(".") else "."
            thousands = "." if decimal == "," else ","
            text = text.replace(thousands, "").replace(decimal, ".")
        elif "," in text:
            text = text.replace(",", ".")
        try:
            return float(text)
        except ValueError:
            pass
    raise CellError(f"número no válido: {value!r}")
