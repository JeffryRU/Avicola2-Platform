"""Modelo de backend/config/schemas.yaml (lo carga infrastructure/config.py)."""

from dataclasses import dataclass, field
from typing import Any, Literal

from app.ingest.domain.normalize import normalize_header
from app.shared.domain.errors import DomainError

ColumnType = Literal["date", "string", "float", "int"]


@dataclass(frozen=True)
class ColumnSpec:
    type: ColumnType
    required: bool = False
    default: Any = None
    aliases: list[str] = field(default_factory=list)
    catalog: Literal["channels", "products"] | None = None
    allowed: list[str] | None = None
    from_filename: bool = False
    min: float | None = None


@dataclass(frozen=True)
class TableSpec:
    merge_keys: list[str]
    columns: dict[str, ColumnSpec]

    def __post_init__(self) -> None:
        missing = set(self.merge_keys) - set(self.columns)
        if missing:
            raise ValueError(f"merge_keys sin columna definida: {sorted(missing)}")

    def alias_index(self) -> dict[str, str]:
        """Nombre normalizado (campo o alias) → campo."""
        index: dict[str, str] = {}
        for name, spec in self.columns.items():
            for alias in [name, *spec.aliases]:
                index.setdefault(normalize_header(alias), name)
        return index


@dataclass(frozen=True)
class RoutingSpec:
    field: str
    default: str
    tables: dict[str, str]
    aliases: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class IngestSchema:
    routing: RoutingSpec
    tables: dict[str, TableSpec]
    granularity: Literal["daily", "weekly"] = "daily"

    def __post_init__(self) -> None:
        unknown = set(self.routing.tables.values()) - set(self.tables)
        if unknown:
            raise ValueError(f"routing apunta a tablas inexistentes: {sorted(unknown)}")
        if self.routing.default not in self.routing.tables:
            raise ValueError("routing.default debe ser una clave de routing.tables")

    def routed_tables(self) -> list[str]:
        return list(dict.fromkeys(self.routing.tables.values()))

    def known_names(self) -> set[str]:
        """Todos los nombres de columna reconocibles (para detectar la fila de encabezado)."""
        names = {normalize_header(n) for n in [self.routing.field, *self.routing.aliases]}
        for table in self.tables.values():
            names |= set(table.alias_index())
        return names

    def fields(self) -> set[str]:
        """Todos los campos destino posibles (columna de ruteo y columnas de las tablas)."""
        return {self.routing.field} | {f for t in self.tables.values() for f in t.columns}

    def require_table(self, table: str | None) -> None:
        """Valida una tabla destino forzada (None = la decide la columna de ruteo)."""
        if table is not None and table not in self.tables:
            raise DomainError(f"tabla desconocida: {table} (válidas: {', '.join(self.tables)})")
