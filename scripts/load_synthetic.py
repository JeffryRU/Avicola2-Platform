"""Carga el histórico sintético (data/synthetic/*.csv) en el lakehouse con la ingesta normal.

Cada CSV pasa por bronze → validación → silver (y gold.daily_demand para los pedidos), y
queda registrado en ingestion_log. Volver a correrlo no duplica filas (merge por clave).

Uso (desde la raíz del repo, después de generate_synthetic.py):
    uv run --project backend python scripts/load_synthetic.py
"""

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import get_settings  # noqa: E402
from app.ingest.bootstrap import build_service  # noqa: E402
from app.ingest.infrastructure.persistence.repository import SqlIngestRepository  # noqa: E402
from app.shared.infrastructure.database.session import SessionLocal  # noqa: E402
from app.shared.infrastructure.lakehouse import get_lakehouse  # noqa: E402
from app.shared.infrastructure.logging.setup import configure_from_settings  # noqa: E402

FILES = {
    "orders.csv": "orders",
    "projections.csv": "projections",
    "saca.csv": "saca",
    "surplus_events.csv": "surplus_events",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dir", type=Path, default=ROOT / "data" / "synthetic")
    args = parser.parse_args()

    missing = [name for name in FILES if not (args.dir / name).exists()]
    if missing:
        sys.exit(f"Faltan {missing} en {args.dir}. Corre antes scripts/generate_synthetic.py")

    settings = get_settings()
    configure_from_settings(settings)
    lakehouse = get_lakehouse(settings)
    print(f"Lakehouse: {lakehouse.uri}")
    with SessionLocal() as session:
        service = build_service(SqlIngestRepository(session), settings, lakehouse)
        for name, table in FILES.items():
            start = time.perf_counter()
            result = service.ingest((args.dir / name).read_bytes(), name, "synthetic", table)
            print(
                f"  {name:<20} → {table:<15} {result.status:<8} "
                f"{result.rows_ok:>6} filas  {result.rows_error} errores  "
                f"{time.perf_counter() - start:5.1f}s  {result.tables}"
            )
            if result.status not in ("ok", "partial"):
                sys.exit(f"Falló la carga de {name}: {result.message}")


if __name__ == "__main__":
    main()
