"""Lectura de Excel/CSV: elige la hoja y la fila de encabezado más probables."""

import hashlib
import io
from dataclasses import dataclass

import pandas as pd

from app.ingest.normalize import is_blank, normalize_header

HEADER_SCAN_ROWS = 15
# Solo la celda vacía es "vacía": textos como "n/a" o "NA" deben llegar a la validación.
_NA = {"keep_default_na": False, "na_values": [""]}


class UnreadableFile(Exception):
    """El archivo no se puede leer como Excel o CSV."""


@dataclass
class RawTable:
    """Datos crudos con encabezados normalizados."""

    df: pd.DataFrame  # columnas = encabezados normalizados, valores sin convertir
    source_columns: list[str]  # encabezados tal como venían
    sheet: str | None
    header_row: int  # índice 0 de la fila de encabezado en la hoja

    def display_name(self, header: str) -> str:
        """Encabezado original (como lo escribió el usuario) a partir del normalizado."""
        return dict(zip(self.df.columns, self.source_columns, strict=True)).get(header, header)

    @property
    def signature(self) -> str:
        """Firma del conjunto de columnas, para reutilizar mapeos confirmados."""
        key = "|".join(sorted(self.df.columns))
        return hashlib.sha1(key.encode()).hexdigest()[:16]

    def excel_row(self, index: int) -> int:
        """Número de fila (1-based, como lo ve el usuario en Excel) de la fila `index` de df."""
        return self.header_row + 2 + index


def _header_score(row: pd.Series, known: set[str]) -> int:
    texts = [v for v in row if isinstance(v, str) and v.strip()]
    hits = sum(normalize_header(v) in known for v in texts)
    return hits * 10 + len(texts)


def _pick_header(raw: pd.DataFrame, known: set[str]) -> tuple[int, int]:
    best_row, best_score = 0, -1
    for i in range(min(HEADER_SCAN_ROWS, len(raw))):
        score = _header_score(raw.iloc[i], known)
        if score > best_score:
            best_row, best_score = i, score
    return best_row, best_score


def _to_table(raw: pd.DataFrame, header_row: int, sheet: str | None) -> RawTable:
    header = raw.iloc[header_row]
    keep = [j for j, v in enumerate(header) if not is_blank(v)]
    body = raw.iloc[header_row + 1 :, keep].reset_index(drop=True)
    source_columns = [str(header.iloc[j]).strip() for j in keep]
    names: list[str] = []
    for col in source_columns:
        name = normalize_header(col) or "columna"
        while name in names:
            name += "_"
        names.append(name)
    body.columns = names
    body = body.astype(object).where(body.notna(), None)
    return RawTable(body, source_columns, sheet, header_row)


def read_file(content: bytes, filename: str, known: set[str]) -> RawTable:
    """Lee el archivo y devuelve la tabla cruda de la hoja que mejor parece una tabla de datos."""
    name = filename.lower()
    try:
        if name.endswith(".csv"):
            raw = pd.read_csv(
                io.BytesIO(content), header=None, dtype=object, sep=None, engine="python", **_NA
            )
            row, _ = _pick_header(raw, known)
            return _to_table(raw, row, None)
        if name.endswith((".xlsx", ".xlsm", ".xls")):
            sheets = pd.read_excel(
                io.BytesIO(content), sheet_name=None, header=None, dtype=object, **_NA
            )
        else:
            raise UnreadableFile(
                f"formato no soportado: {filename} (se aceptan .xlsx, .xls y .csv)"
            )
    except UnreadableFile:
        raise
    except Exception as exc:  # pandas/openpyxl lanzan varios tipos según el daño del archivo
        raise UnreadableFile(f"no se pudo leer {filename}: {exc}") from exc

    best: tuple[int, str, int] | None = None
    for sheet, raw in sheets.items():
        if raw.dropna(how="all").empty:
            continue
        row, score = _pick_header(raw, known)
        if best is None or score > best[0]:
            best = (score, sheet, row)
    if best is None:
        raise UnreadableFile(f"{filename} no tiene datos")
    _, sheet, row = best
    return _to_table(sheets[sheet], row, sheet)
