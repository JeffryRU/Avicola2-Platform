"""Catálogo de canales, productos y tipos de registro (backend/config/catalog.yaml)."""

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

from app.core.config import get_settings


class Catalog(BaseModel):
    channels: list[str] = Field(min_length=1)
    products: list[str] = Field(min_length=1)
    record_types: list[str] = Field(min_length=1)


def load_catalog(path: Path) -> Catalog:
    """Lee y valida un catálogo desde YAML."""
    with path.open(encoding="utf-8") as fh:
        return Catalog.model_validate(yaml.safe_load(fh))


@lru_cache
def get_catalog() -> Catalog:
    """Catálogo de la configuración activa."""
    return load_catalog(get_settings().config_dir / "catalog.yaml")
