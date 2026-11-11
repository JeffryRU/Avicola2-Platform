"""Carga la historia de producción desde el Excel del negocio (hoja DB_CALIDA_B).

Una fila por fecha y rango (B0..B9), con lo pedido a granja, lo producido y la calidad B.
El rango Bn corresponde al producto n+1 de la categoría BRASA (B0 = Brasa 1 … B9 = Brasa 10).
"""

from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook

from app.planning.domain.models import Product
from app.planning.domain.production import DailyProduction, ProductionLine

SHEET = "DB_CALIDA_B"
COLUMNS = {"FECHA": "date", "RANGO": "range", "PEDIDO": "ordered", "PRODUCCION": "produced"}
QUALITY_B = "CALIDAD B"
IMPORTED_BY = "importacion"


def _number(value: object) -> float:
    return float(value) if isinstance(value, int | float) else 0.0


def read_production(
    path: Path, brasa: list[Product], at: datetime
) -> tuple[list[DailyProduction], int]:
    """Devuelve los días leídos y cuántas filas se descartaron (rango o fecha no reconocidos)."""
    by_range = {f"B{i}": p.id for i, p in enumerate(sorted(brasa, key=lambda p: p.sort_order))}
    sheet = load_workbook(path, read_only=True, data_only=True)[SHEET]
    index: dict[str, int] = {}
    days: dict[date, dict[str, ProductionLine]] = defaultdict(dict)
    skipped = 0
    for row in sheet.iter_rows(values_only=True):
        if not index:
            names = [str(c).strip().upper() if c is not None else "" for c in row]
            if all(name in names for name in (*COLUMNS, QUALITY_B)):
                # «CALIDAD B» aparece también como «Total Calidad B»: se toma la primera exacta.
                index = {key: names.index(name) for name, key in COLUMNS.items()}
                index["quality_b"] = names.index(QUALITY_B)
            continue
        when, code = row[index["date"]], str(row[index["range"]] or "").strip().upper()
        if not isinstance(when, datetime) or code not in by_range:
            skipped += code not in ("", "CARNE")
            continue
        produced = round(_number(row[index["produced"]]))
        quality_b = min(produced, round(_number(row[index["quality_b"]])))
        days[when.date()][by_range[code]] = ProductionLine(
            by_range[code], round(_number(row[index["ordered"]]), 2), produced, quality_b
        )
    if not index:
        raise ValueError(f"La hoja {SHEET} no tiene las columnas esperadas.")
    result = [
        DailyProduction(day, tuple(lines.values()), IMPORTED_BY, at)
        for day, lines in sorted(days.items())
        if any(line.produced or line.ordered for line in lines.values())
    ]
    return result, skipped
