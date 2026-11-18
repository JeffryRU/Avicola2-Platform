"""Carga la historia de producción desde el Excel del negocio (hoja DB_CALIDA_B).

Una fila por fecha y rango (B0..B9), con lo pedido a granja, lo producido y la calidad B.
El rango Bn corresponde al producto n+1 de la categoría BRASA (B0 = Brasa 1 … B9 = Brasa 10).
"""

import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from app.planning.domain.file_specs import RowError
from app.planning.domain.models import Product
from app.planning.domain.production import (
    MAX_FLOCK_KG,
    MIN_FLOCK_KG,
    DailyProduction,
    ProductionLine,
)
from app.planning.domain.saca import product_group
from app.planning.infrastructure.file_specs import file_spec
from app.planning.infrastructure.tabular import match, open_workbook

# Columnas y hoja: config/imports.yaml (archivo «produccion»).
SHEET = file_spec("produccion").sheet or ""
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
IMPORTED_BY = "importacion"


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
    spec = file_spec("produccion")
    book = open_workbook(path)
    days: dict[date, dict[str, ProductionLine]] = defaultdict(dict)
    skipped = 0
    try:
        found = match(book[SHEET].iter_rows(values_only=True), [spec])
        if found is None:
            raise ValueError(f"La hoja {SHEET} no tiene las columnas esperadas.")
        _, positions, rows, _ = found
        for cells in rows:
            col = positions["range"]
            code = str((cells[col] if col < len(cells) else None) or "").strip().upper()
            try:
                row = spec.convert(cells, positions)
            except RowError:
                row = None  # fecha o número que no se puede leer
            if row is None or row["date"] is None or code not in by_range:
                # Las filas sin rango (subtotales, títulos) o de carne no cuentan como descartadas.
                skipped += code not in ("", "CARNE")
                continue
            day = row["date"]
            kg = _flock_kg(row["weight"])
            if kg is not None:
                weights[day][group_of[by_range[code]]].append(kg)
            produced = round(row["produced"])
            quality_b = min(produced, round(row["quality_b"]))
            days[day][by_range[code]] = ProductionLine(
                by_range[code], round(row["ordered"], 2), produced, quality_b
            )
    finally:
        book.close()
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
