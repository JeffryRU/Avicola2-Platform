"""Reglas de la arquitectura hexagonal: el dominio y la aplicación no conocen la infraestructura."""

import ast
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[1] / "app"
# Contextos con capas hexagonales (más `shared`, que solo tiene domain e infrastructure).
CONTEXTS = ("planning", "ingest")
FRAMEWORKS = (
    "sqlalchemy",
    "fastapi",
    "pydantic",
    "jwt",
    "yaml",
    "alembic",
    "starlette",
    "pandas",
    "numpy",
    "pyarrow",
    "deltalake",
    "duckdb",
    "openpyxl",
    "holidays",
)
# capa → segmentos de un módulo de la app que esa capa no puede importar
OUTER_LAYERS = {
    "domain": {"application", "infrastructure", "bootstrap"},
    "application": {"infrastructure", "bootstrap"},
}
# app.core (configuración) y app.db (ORM) son infraestructura de la plataforma.
PLATFORM = ("app.core", "app.db")


def _imports(path: Path) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names |= {a.name for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def _forbidden(layer: str, module: str) -> bool:
    if module.startswith(FRAMEWORKS) or module.startswith(PLATFORM):
        return True
    return module.startswith("app.") and bool(OUTER_LAYERS[layer] & set(module.split(".")))


CASES = [
    (layer, f)
    for layer in OUTER_LAYERS
    for f in sorted([*APP.glob(f"*/{layer}/**/*.py"), *APP.glob(f"*/{layer}/*.py")])
]


@pytest.mark.parametrize(("layer", "path"), CASES, ids=lambda v: str(v)[-50:])
def test_layer_does_not_import_outer_layers(layer: str, path: Path) -> None:
    bad = {m for m in _imports(path) if _forbidden(layer, m)}
    assert not bad, f"{path.relative_to(APP)} importa {bad}"


@pytest.mark.parametrize("context", CONTEXTS)
def test_context_has_all_layers(context: str) -> None:
    root = APP / context
    for layer in ("domain", "application", "infrastructure"):
        assert any((root / layer).rglob("*.py")), f"{context}/{layer} vacío"
    assert (root / "bootstrap.py").is_file(), f"{context} sin raíz de composición"


@pytest.mark.parametrize(("context", "layer"), [(c, la) for c in CONTEXTS for la in OUTER_LAYERS])
def test_rules_cover_files(context: str, layer: str) -> None:
    assert any(f.is_relative_to(APP / context / layer) for la, f in CASES if la == layer)


@pytest.mark.parametrize("legacy", ["api", "lakehouse", "synthetic", "ml", "core/catalog.py"])
def test_legacy_ingest_layout_is_gone(legacy: str) -> None:
    """La ingesta vive en app/ingest (ADR 0004); no volver a la estructura anterior."""
    assert not (APP / legacy).exists()
