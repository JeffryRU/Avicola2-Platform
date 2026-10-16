"""Normalización de encabezados y valores que llegan en Excel heterogéneos."""

import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any

import pandas as pd

_EXCEL_EPOCH = date(1899, 12, 30)


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
    if isinstance(value, float) and pd.isna(value):
        return True
    if value is pd.NaT:
        return True
    return isinstance(value, str) and not value.strip()


def parse_date(value: Any) -> date:
    if isinstance(value, datetime | pd.Timestamp):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, int | float) and 20000 <= value <= 80000:  # serial de Excel
        return _EXCEL_EPOCH + timedelta(days=int(value))
    if isinstance(value, str):
        text = value.strip()
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%Y/%m/%d"):
            try:
                return datetime.strptime(text[:10] if fmt == "%Y-%m-%d" else text, fmt).date()
            except ValueError:
                continue
    raise CellError(f"fecha no válida: {value!r}")


def parse_number(value: Any) -> float:
    """Acepta números y textos como '1.234,5', '1,234.5', '12,5' o '  80 '."""
    if isinstance(value, bool):
        raise CellError(f"número no válido: {value!r}")
    if isinstance(value, int | float):
        if pd.isna(value):
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
