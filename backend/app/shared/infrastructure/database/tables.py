"""Nombres físicos de las tablas, leídos de config/tables.yaml (fuente única)."""

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

from app.core.config import get_settings


class TableNames(BaseModel):
    """Esquema lógico y mapa nombre lógico → nombre físico."""

    schema_: str = Field(alias="schema")
    tables: dict[str, str] = Field(min_length=1)

    def __getitem__(self, logical: str) -> str:
        try:
            return self.tables[logical]
        except KeyError as exc:
            raise KeyError(f"tabla sin nombre en tables.yaml: {logical}") from exc

    def fk(self, logical: str, column: str = "id") -> str:
        """Referencia para ForeignKey: `<esquema>.<tabla>.<columna>`."""
        return f"{self.schema_}.{self[logical]}.{column}"


def load_table_names(path: Path) -> TableNames:
    with path.open(encoding="utf-8") as fh:
        return TableNames.model_validate(yaml.safe_load(fh))


@lru_cache
def get_table_names() -> TableNames:
    return load_table_names(get_settings().config_dir / "tables.yaml")
