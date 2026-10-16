"""Genera la plantilla Excel estándar con validaciones a partir de backend/config/catalog.yaml.

Uso (desde la raíz del repo):
    uv run --project backend python scripts/generate_template.py
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.catalog import get_catalog  # noqa: E402
from app.ingest.template import DEFAULT_ROWS, build_template  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--out", type=Path, default=ROOT / "data" / "templates" / "plantilla_carga.xlsx"
    )
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS, help="filas con validación")
    args = parser.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    build_template(get_catalog(), rows=args.rows).save(args.out)
    print(f"Plantilla generada: {args.out}")


if __name__ == "__main__":
    main()
