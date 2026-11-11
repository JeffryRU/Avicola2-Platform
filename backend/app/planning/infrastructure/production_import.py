"""Carga la historia de producción desde el Excel del negocio (hoja DB_CALIDA_B).

Una fila por fecha y rango (B0..B9), con lo pedido a granja, lo producido y la calidad B.
El rango Bn corresponde al producto n+1 de la categoría BRASA (B0 = Brasa 1 … B9 = Brasa 10).
"""

import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook

from app.planning.domain.models import Product
from app.planning.domain.production import (
    MAX_FLOCK_KG,
    MIN_FLOCK_KG,
    DailyProduction,
    ProductionLine,
)
from app.planning.domain.saca import product_group

SHEET = "DB_CALIDA_B"
COLUMNS = {"FECHA": "date", "RANGO": "range", "PEDIDO": "ordered", "PRODUCCION": "produced"}
QUALITY_B = "CALIDAD B"
WEIGHT = "PESO PROMEDIO"
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
IMPORTED_BY = "importacion"


def _number(value: object) -> float:
    return float(value) if isinstance(value, int | float) else 0.0


def _flock_kg(value: object) -> float | None:
    """Peso promedio de la celda: un número o varios («2.33 Y 2.32», un galpón cada uno)."""
    found = [float(n.replace(",", ".")) for n in _NUMBER.findall(str(value or ""))]
    valid = [n for n in found if MIN_FLOCK_KG <= n <= MAX_FLOCK_KG]
    return round(sum(valid) / len(valid), 3) if valid else None


def read_production(
    path: Path, brasa: list[Product], at: datetime
) -> tuple[list[DailyProduction], int]:
    """Devuelve los días leídos y cuántas filas se descartaron (rango o fecha no reconocidos)."""
    by_range = {f"B{i}": p.id for i, p in enumerate(sorted(brasa, key=lambda p: p.sort_order))}
    group_of = {p.id: product_group(p) for p in brasa}
    weights: dict[date, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
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
                index["weight"] = names.index(WEIGHT) if WEIGHT in names else -1
            continue
        when, code = row[index["date"]], str(row[index["range"]] or "").strip().upper()
        if not isinstance(when, datetime) or code not in by_range:
            skipped += code not in ("", "CARNE")
            continue
        kg = _flock_kg(row[index["weight"]]) if index["weight"] >= 0 else None
        if kg is not None:
            weights[when.date()][group_of[by_range[code]]].append(kg)
        produced = round(_number(row[index["produced"]]))
        quality_b = min(produced, round(_number(row[index["quality_b"]])))
        days[when.date()][by_range[code]] = ProductionLine(
            by_range[code], round(_number(row[index["ordered"]]), 2), produced, quality_b
        )
    if not index:
        raise ValueError(f"La hoja {SHEET} no tiene las columnas esperadas.")
    result = [
        DailyProduction(
            day,
            tuple(lines.values()),
            IMPORTED_BY,
            at,
            {g: round(sum(kgs) / len(kgs), 3) for g, kgs in weights[day].items()},
        )
        for day, lines in sorted(days.items())
        if any(line.produced or line.ordered for line in lines.values())
    ]
    return result, skipped
