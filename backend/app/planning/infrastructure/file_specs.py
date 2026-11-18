"""Lee y valida backend/config/imports.yaml (qué archivos acepta la app y sus columnas)."""

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import TypeAdapter

from app.core.config import get_settings
from app.planning.domain.file_specs import ColumnSpec, FileSpec, KeepIf

_COLUMNS = TypeAdapter(dict[str, ColumnSpec])
_KEEP = TypeAdapter(tuple[KeepIf, ...])


def _spec(key: str, raw: dict[str, Any]) -> FileSpec:
    return FileSpec(
        key=key,
        label=raw["label"],
        description=raw.get("description", ""),
        used_by=tuple(raw.get("used_by", ())),
        columns=_COLUMNS.validate_python(raw["columns"]),
        detect=tuple(raw["detect"]),
        upload=raw.get("upload"),
        sheet=raw.get("sheet"),
        table=raw.get("table"),
        date_field=raw.get("date_field"),
        unique=raw.get("unique"),
        keep_if=_KEEP.validate_python(raw.get("keep_if", ())),
        drop_if=_KEEP.validate_python(raw.get("drop_if", ())),
    )


def load_file_specs(path: Path) -> dict[str, FileSpec]:
    with path.open(encoding="utf-8") as fh:
        files = yaml.safe_load(fh)["files"]
    return {key: _spec(key, raw) for key, raw in files.items()}


@lru_cache
def file_specs() -> dict[str, FileSpec]:
    return load_file_specs(get_settings().config_dir / "imports.yaml")


def file_spec(key: str) -> FileSpec:
    return file_specs()[key]
