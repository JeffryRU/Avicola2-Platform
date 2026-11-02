"""Carga y valida backend/config/schemas.yaml y backend/config/catalog.yaml."""

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import TypeAdapter

from app.core.config import get_settings
from app.ingest.domain.catalog import Catalog
from app.ingest.domain.schema import IngestSchema


def _load[T](model: type[T], path: Path) -> T:
    with path.open(encoding="utf-8") as fh:
        return TypeAdapter(model).validate_python(yaml.safe_load(fh))


def load_schema(path: Path) -> IngestSchema:
    return _load(IngestSchema, path)


def load_catalog(path: Path) -> Catalog:
    """Lee y valida un catálogo desde YAML."""
    return _load(Catalog, path)


@lru_cache
def get_schema() -> IngestSchema:
    return load_schema(get_settings().config_dir / "schemas.yaml")


@lru_cache
def get_catalog() -> Catalog:
    """Catálogo de la configuración activa."""
    return load_catalog(get_settings().config_dir / "catalog.yaml")
