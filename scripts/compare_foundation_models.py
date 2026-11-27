"""Prueba modelos preentrenados de series de tiempo (Chronos-Bolt) con la historia de ARIS.

Uso (en un entorno con torch y chronos-forecasting, aparte del backend):
  python scripts/compare_foundation_models.py DESPACHO_parte1.csv [más.csv]

Mismo backtest que scripts/train_demand_model.py: cada uno de los últimos 120 días se predice
con lo conocido hasta 2 días antes, y se mide contra lo despachado en tres niveles. El modelo no
se entrena: recibe nuestra historia como contexto (zero-shot).
"""

import sys
from pathlib import Path

import numpy as np
import torch
from chronos import BaseChronosPipeline

sys.path.insert(0, str(Path(__file__).parent))
from train_demand_model import HORIZON, TEST, ewma, load, median4  # noqa: E402


def chronos_model(name: str, level: str):
    """`level`: «detalle» predice cada vendedor×producto; «vendedor» predice el total de cada
    vendedor y lo reparte con su mezcla de productos de las últimas 8 semanas."""
    pipe = BaseChronosPipeline.from_pretrained(name, device_map="cpu", torch_dtype=torch.float32)

    def predict(Y, day):
        last = day - HORIZON + 1  # contexto: hasta day−HORIZON
        S, P, _ = Y.shape
        if level == "detalle":
            series = Y[:, :, :last].reshape(S * P, -1)
        else:
            series = Y[:, :, :last].sum(axis=1)
        ctx = [torch.tensor(s, dtype=torch.float32) for s in series]
        q, _ = pipe.predict_quantiles(ctx, prediction_length=HORIZON, quantile_levels=[0.5])
        pred = q[:, HORIZON - 1, 0].numpy().clip(min=0)
        if level == "detalle":
            return pred.reshape(S, P)
        hist = Y[:, :, max(0, last - 56) : last].sum(axis=2)
        mix = hist / np.maximum(hist.sum(axis=1, keepdims=True), 1e-9)
        return pred[:, None] * mix

    return predict


def evaluate(Y, models):
    n = Y.shape[2]
    test = range(n - TEST, n)
    for name, f in models.items():
        P = np.stack([np.clip(f(Y, d), 0, None) for d in test], axis=2)
        A = Y[:, :, list(test)]
        res = {
            "vendedor×producto×día": np.abs(P - A).sum() / A.sum(),
            "vendedor×día": np.abs(P.sum(1) - A.sum(1)).sum() / A.sum(),
            "equipo×día": np.abs(P.sum((0, 1)) - A.sum((0, 1))).sum() / A.sum(),
            "sesgo": (P.sum() - A.sum()) / A.sum(),
        }
        print(f"{name:<44} " + " · ".join(f"{k} {100 * v:.1f}%" for k, v in res.items()), flush=True)


def main() -> None:
    _, sold, days, sellers, *_ = load(sys.argv[1:])
    print(f"vendedores {len(sellers)} · días {len(days)}", flush=True)
    evaluate(
        sold,
        {
            "Mediana mismo día, 4 sem. (actual)": median4,
            "Suavizado exp. mismo día": ewma,
            "Chronos-Bolt small (detalle)": chronos_model("amazon/chronos-bolt-small", "detalle"),
            "Chronos-Bolt small (vendedor × mezcla)": chronos_model(
                "amazon/chronos-bolt-small", "vendedor"
            ),
            "Chronos-Bolt base (vendedor × mezcla)": chronos_model(
                "amazon/chronos-bolt-base", "vendedor"
            ),
        },
    )


if __name__ == "__main__":
    main()
