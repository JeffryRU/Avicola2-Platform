"""Acceso al lakehouse: archivos crudos (bronze) y tablas Delta (silver, gold).

Es la única capa que conoce LAKEHOUSE_URI (disco local o gs://…), ver ADR 0001.
Un solo escritor: todas las escrituras Delta pasan por un lock de proceso, y el backend
corre con un único worker (UVICORN_WORKERS=1).
"""

import re
import threading
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any

import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
from deltalake import DeltaTable, write_deltalake
from deltalake.exceptions import TableNotFoundError

from app.core.config import get_settings

_write_lock = threading.Lock()

ARROW_TYPES: dict[str, pa.DataType] = {
    "date": pa.date32(),
    "string": pa.string(),
    "float": pa.float64(),
    "int": pa.int64(),
}
# Columnas de linaje que se agregan a toda tabla silver.
LINEAGE_FIELDS = [
    pa.field("source_file", pa.string()),
    pa.field("source_ref", pa.string()),
    pa.field("ingested_at", pa.timestamp("us", tz="UTC")),
]


def _safe_name(filename: str) -> str:
    name = PurePosixPath(filename.replace("\\", "/")).name
    return re.sub(r"[^\w.\-]+", "_", name) or "archivo"


class Lakehouse:
    """Lakehouse en `uri`: `{uri}/bronze/...` (archivos) y `{uri}/{capa}/{tabla}` (Delta)."""

    def __init__(self, uri: str, storage_options: dict[str, str] | None = None) -> None:
        self.uri = uri.rstrip("/")
        self.storage_options = storage_options
        self._fs, self._root = pafs.FileSystem.from_uri(
            self.uri if "://" in self.uri else Path(self.uri).resolve().as_uri()
        )

    # --- bronze ------------------------------------------------------------------
    def put_bronze(
        self, source: str, filename: str, content: bytes, when: datetime | None = None
    ) -> str:
        """Guarda el archivo crudo y devuelve su clave relativa. Nunca sobrescribe."""
        when = when or datetime.now(UTC)
        key = (
            f"bronze/{_safe_name(source)}/{when:%Y/%m/%d}/"
            f"{when:%H%M%S}_{uuid.uuid4().hex[:6]}_{_safe_name(filename)}"
        )
        path = f"{self._root}/{key}"
        self._fs.create_dir(path.rsplit("/", 1)[0], recursive=True)
        with self._fs.open_output_stream(path) as out:
            out.write(content)
        return key

    def get_bronze(self, key: str) -> bytes:
        if not key.startswith("bronze/") or ".." in key.split("/"):
            raise ValueError(f"clave de bronze no válida: {key}")
        with self._fs.open_input_stream(f"{self._root}/{key}") as fh:
            return fh.read()

    # --- Delta -------------------------------------------------------------------
    def table_uri(self, layer: str, table: str) -> str:
        return f"{self.uri}/{layer}/{table}"

    def _open(self, layer: str, table: str) -> DeltaTable | None:
        try:
            return DeltaTable(self.table_uri(layer, table), storage_options=self.storage_options)
        except TableNotFoundError:
            return None

    def version(self, layer: str, table: str) -> int | None:
        dt = self._open(layer, table)
        return None if dt is None else dt.version()

    def upsert(self, layer: str, table: str, data: pa.Table, keys: Sequence[str]) -> int:
        """Merge por clave natural (actualiza e inserta). Devuelve la versión Delta resultante."""
        if data.num_rows == 0:
            raise ValueError("no hay filas para escribir")
        with _write_lock:
            dt = self._open(layer, table)
            if dt is None:
                write_deltalake(
                    self.table_uri(layer, table),
                    data,
                    mode="append",
                    storage_options=self.storage_options,
                )
            else:
                predicate = " AND ".join(f"t.{k} = s.{k}" for k in keys)
                (
                    dt.merge(source=data, predicate=predicate, source_alias="s", target_alias="t")
                    .when_matched_update_all()
                    .when_not_matched_insert_all()
                    .execute()
                )
            return self._open(layer, table).version()

    def read(
        self,
        layer: str,
        table: str,
        columns: Sequence[str] | None = None,
        where_in: tuple[str, Sequence[Any]] | None = None,
        version: int | None = None,
    ) -> pd.DataFrame:
        """Lee una tabla (o una versión anterior) con un filtro opcional `columna IN (...)`."""
        dt = self._open(layer, table)
        if dt is None:
            return pd.DataFrame(columns=list(columns or []))
        if version is not None:
            dt.load_as_version(version)
        dataset = dt.to_pyarrow_dataset()
        expr = None
        if where_in is not None:
            column, values = where_in
            expr = pc.field(column).isin(
                pa.array(list(values), type=dataset.schema.field(column).type)
            )
        return dataset.to_table(columns=list(columns) if columns else None, filter=expr).to_pandas()


def get_lakehouse() -> Lakehouse:
    """Lakehouse configurado. Las rutas relativas se resuelven desde la raíz del repo."""
    settings = get_settings()
    uri = settings.lakehouse_uri
    if "://" not in uri and not Path(uri).is_absolute():
        uri = str((settings.config_dir.parents[1] / uri).resolve())
    return Lakehouse(uri)
