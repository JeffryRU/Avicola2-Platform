"""Modelo de backend/config/schemas.yaml."""

from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, model_validator

from app.core.config import get_settings
from app.ingest.normalize import normalize_header

ColumnType = Literal["date", "string", "float", "int"]


class ColumnSpec(BaseModel):
    type: ColumnType
    required: bool = False
    default: Any = None
    aliases: list[str] = Field(default_factory=list)
    catalog: Literal["channels", "products"] | None = None
    allowed: list[str] | None = None
    from_filename: bool = False
    min: float | None = None


class TableSpec(BaseModel):
    merge_keys: list[str]
    columns: dict[str, ColumnSpec]

    @model_validator(mode="after")
    def _keys_exist(self) -> "TableSpec":
        missing = set(self.merge_keys) - set(self.columns)
        if missing:
            raise ValueError(f"merge_keys sin columna definida: {sorted(missing)}")
        return self

    def alias_index(self) -> dict[str, str]:
        """Nombre normalizado (campo o alias) → campo."""
        index: dict[str, str] = {}
        for field, spec in self.columns.items():
            for name in [field, *spec.aliases]:
                index.setdefault(normalize_header(name), field)
        return index


class RoutingSpec(BaseModel):
    field: str
    aliases: list[str] = Field(default_factory=list)
    default: str
    tables: dict[str, str]


class IngestSchema(BaseModel):
    granularity: Literal["daily", "weekly"] = "daily"
    routing: RoutingSpec
    tables: dict[str, TableSpec]

    @model_validator(mode="after")
    def _routing_targets_exist(self) -> "IngestSchema":
        unknown = set(self.routing.tables.values()) - set(self.tables)
        if unknown:
            raise ValueError(f"routing apunta a tablas inexistentes: {sorted(unknown)}")
        if self.routing.default not in self.routing.tables:
            raise ValueError("routing.default debe ser una clave de routing.tables")
        return self

    def routed_tables(self) -> list[str]:
        return list(dict.fromkeys(self.routing.tables.values()))

    def known_names(self) -> set[str]:
        """Todos los nombres de columna reconocibles (para detectar la fila de encabezado)."""
        names = {normalize_header(n) for n in [self.routing.field, *self.routing.aliases]}
        for table in self.tables.values():
            names |= set(table.alias_index())
        return names


def load_schema(path: Path) -> IngestSchema:
    with path.open(encoding="utf-8") as fh:
        return IngestSchema.model_validate(yaml.safe_load(fh))


@lru_cache
def get_schema() -> IngestSchema:
    return load_schema(get_settings().config_dir / "schemas.yaml")
