"""Reglas de la arquitectura hexagonal (ADR 0004 y 0016).

La fuente única de las reglas de imports son los contratos de import-linter en pyproject.toml
(`uv run lint-imports`, también en CI). Aquí se corren dentro de pytest y se verifica que los
contratos cubran todos los contextos.
"""

import subprocess
import sys
import tomllib
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
APP = BACKEND / "app"
PYPROJECT = BACKEND / "pyproject.toml"
# Contextos con capas hexagonales (más `shared`, que solo tiene domain e infrastructure).
CONTEXTS = ("planning", "ingest")


def _contracts() -> dict[str, dict]:
    config = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    return {c["id"]: c for c in config["tool"]["importlinter"]["contracts"]}


def test_import_contracts_pass() -> None:
    # En otro proceso: import-linter reconfigura el logging y afectaría a las demás pruebas.
    result = subprocess.run(  # noqa: S603 (comando fijo, sin entrada externa)
        [Path(sys.executable).with_name("lint-imports"), "--no-cache", "--config", str(PYPROJECT)],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize("context", CONTEXTS)
def test_contracts_cover_context(context: str) -> None:
    contracts = _contracts()
    assert f"app.{context}" in contracts["capas-de-cada-modulo"]["containers"]
    assert f"app.{context}" in contracts["modulos-independientes"]["modules"]
    assert (
        f"app.{context}.bootstrap"
        in contracts["bootstrap-solo-desde-entradas"]["protected_modules"]
    )
    pure = contracts["dominio-puro"]["source_modules"]
    assert {f"app.{context}.domain", f"app.{context}.application"} <= set(pure)


def test_every_context_is_in_the_contracts() -> None:
    """Un contexto nuevo (carpeta con bootstrap.py) se suma a CONTEXTS y a los contratos."""
    found = {p.parent.name for p in APP.glob("*/bootstrap.py")}
    assert found == set(CONTEXTS)


@pytest.mark.parametrize("context", CONTEXTS)
def test_context_has_all_layers(context: str) -> None:
    root = APP / context
    for layer in ("domain", "application", "infrastructure"):
        assert any((root / layer).rglob("*.py")), f"{context}/{layer} vacío"
    assert (root / "bootstrap.py").is_file(), f"{context} sin raíz de composición"


@pytest.mark.parametrize(
    "legacy", ["api", "lakehouse", "synthetic", "ml", "core/catalog.py", "db/session.py"]
)
def test_legacy_layout_is_gone(legacy: str) -> None:
    """La ingesta vive en app/ingest (ADR 0004); no volver a la estructura anterior."""
    assert not (APP / legacy).exists()
