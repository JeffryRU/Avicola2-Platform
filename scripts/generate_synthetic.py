"""Genera el histórico sintético (CSV) y los Excel de ejemplo.

Uso (desde la raíz del repo):
    uv run --project backend python scripts/generate_synthetic.py
    uv run --project backend python scripts/generate_synthetic.py --end 2026-10-14 --seed 42
"""

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.catalog import get_catalog  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.synthetic.generator import SyntheticConfig, generate, write_dataset  # noqa: E402
from app.synthetic.samples import write_samples  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--end",
        type=date.fromisoformat,
        default=date.today() - timedelta(days=1),
        help="último día del histórico (por defecto, ayer)",
    )
    parser.add_argument("--days", type=int, default=548, help="días de historia (~18 meses)")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path, default=ROOT / "data" / "synthetic")
    parser.add_argument("--samples", type=Path, default=ROOT / "data" / "samples")
    parser.add_argument("--no-samples", action="store_true", help="no generar los Excel de ejemplo")
    args = parser.parse_args()

    settings = get_settings()
    cfg = SyntheticConfig(
        end=args.end,
        days=args.days,
        seed=args.seed,
        yield_factor=settings.yield_factor,
        avg_live_weight_kg=settings.avg_live_weight_kg,
    )
    ds = generate(cfg)

    print(f"Histórico sintético {cfg.start} → {cfg.end} (seed {cfg.seed})")
    for path in write_dataset(ds, args.out):
        print(f"  {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")
    print("Resumen:")
    for key, value in ds.summary.items():
        print(f"  {key}: {value}")

    if not args.no_samples:
        print("Excel de ejemplo:")
        for sample in write_samples(ds, get_catalog(), args.samples):
            print(f"  {sample.path.name}  ({sample.case})")


if __name__ == "__main__":
    main()
