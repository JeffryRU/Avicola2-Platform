"""Reglas de la arquitectura hexagonal: el dominio y la aplicación no conocen la infraestructura."""

import ast
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[1] / "app"
FRAMEWORKS = ("sqlalchemy", "fastapi", "pydantic", "jwt", "yaml", "alembic", "starlette")

# capa → prefijos de import prohibidos
RULES = {
    "domain": (*FRAMEWORKS, "app.planning.application", "app.planning.infrastructure"),
    "application": (*FRAMEWORKS, "app.planning.infrastructure", "app.shared.infrastructure"),
}


def _imports(path: Path) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names |= {a.name for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


CASES = [
    (layer, f)
    for layer in RULES
    for f in sorted([*APP.glob(f"*/{layer}/**/*.py"), *APP.glob(f"*/{layer}/*.py")])
]


@pytest.mark.parametrize(("layer", "path"), CASES, ids=lambda v: str(v)[-50:])
def test_layer_does_not_import_outer_layers(layer: str, path: Path) -> None:
    bad = {m for m in _imports(path) if m.startswith(RULES[layer])}
    assert not bad, f"{path.relative_to(APP)} importa {bad}"


def test_rules_cover_files() -> None:
    assert any(layer == "domain" for layer, _ in CASES)
    assert any(layer == "application" for layer, _ in CASES)
