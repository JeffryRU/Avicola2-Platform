"""Búsqueda de hiperparámetros del modelo de demanda con división temporal 70/15/15.

Uso: uv run --project backend python scripts/tune_demand_model.py DESPACHO_parte1.csv [más.csv]

- Entrenamiento: el primer 70 % de los días; validación: el 15 % siguiente (elige la
  configuración); prueba: el último 15 % (se mide una sola vez, al final). Cortes por fecha,
  nunca al azar: el modelo no ve el futuro.
- Mismas variables que scripts/train_demand_model.py (rezagos del mismo día, medias de 7 y 28
  días, total y mezcla del vendedor, calendario y feriados) y predicción con 2 días de horizonte.
- Se compara en la prueba contra la mediana actual, el suavizado y el modelo por cliente.
"""

import itertools
import random
import sys
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

sys.path.insert(0, str(Path(__file__).parent))
from train_demand_model import (  # noqa: E402
    by_customer_model,
    ewma,
    features,
    load,
    median4,
)

FIRST = 42  # días mínimos de historia para armar las variables


def wape(P: np.ndarray, A: np.ndarray) -> dict[str, float]:
    """Error en tres niveles; P y A: (vendedor, producto, día)."""
    return {
        "detalle": 100 * np.abs(P - A).sum() / A.sum(),
        "vendedor×día": 100 * np.abs(P.sum(1) - A.sum(1)).sum() / A.sum(),
        "equipo×día": 100 * np.abs(P.sum((0, 1)) - A.sum((0, 1))).sum() / A.sum(),
        "sesgo": 100 * (P.sum() - A.sum()) / A.sum(),
    }


def show(name: str, r: dict[str, float]) -> None:
    print(f"{name:<58} " + " · ".join(f"{k} {v:.1f}%" for k, v in r.items()), flush=True)


def main() -> None:
    _, Y, days, sellers, cust, owner = load([a for a in sys.argv[1:] if not a.isdigit()])
    S, P, n = Y.shape
    usable = list(range(FIRST, n))
    a, b = int(len(usable) * 0.70), int(len(usable) * 0.85)
    train, val, test = usable[:a], usable[a:b], usable[b:]
    print(
        f"días: entrenamiento {len(train)} ({days[train[0]].date()}–{days[train[-1]].date()}) · "
        f"validación {len(val)} ({days[val[0]].date()}–{days[val[-1]].date()}) · "
        f"prueba {len(test)} ({days[test[0]].date()}–{days[test[-1]].date()})",
        flush=True,
    )
    X = {d: features(Y, days, d) for d in usable}
    y = {d: Y[:, :, d].ravel() for d in usable}

    def stack(ds):
        return np.vstack([X[d] for d in ds]), np.concatenate([y[d] for d in ds])

    def predict(model, ds):
        return np.stack([model.predict(X[d]).reshape(S, P).clip(min=0) for d in ds], axis=2)

    Xtr, ytr = stack(train)
    A_val, A_test = Y[:, :, val], Y[:, :, test]

    grid = {
        "loss": ["poisson", "absolute_error", "squared_error"],
        "learning_rate": [0.02, 0.05, 0.1],
        "max_leaf_nodes": [7, 15, 31, 63],
        "min_samples_leaf": [10, 30, 80],
        "l2_regularization": [0.0, 1.0, 5.0],
        "max_iter": [150, 400, 800],
    }
    combos = list(itertools.product(*grid.values()))
    random.Random(7).shuffle(combos)
    tried = []
    budget = int(sys.argv[-1]) if sys.argv[-1].isdigit() else 60
    if budget == 0:  # sin búsqueda: la mejor configuración de la corrida anterior
        combos = [("poisson", 0.05, 31, 80, 1.0, 150)]
    for values in combos[: max(budget, 1)]:
        params = dict(zip(grid, values))
        model = HistGradientBoostingRegressor(
            **params, categorical_features=[0, 1], random_state=7
        )
        model.fit(Xtr, ytr)
        r = wape(predict(model, val), A_val)
        tried.append((r["vendedor×día"], params, r))
    tried.sort(key=lambda t: t[0])
    print("\nMejores 5 en validación (vendedor×día):")
    for _, params, r in tried[:5]:
        show(str(params), r)

    best = tried[0][1]
    Xall, yall = stack(train + val)
    final = HistGradientBoostingRegressor(**best, categorical_features=[0, 1], random_state=7)
    final.fit(Xall, yall)
    cust4 = by_customer_model(cust, owner, S, weeks=4)
    print(f"\nPrueba ({len(test)} días, nunca vistos):")
    show("Boosting con los mejores hiperparámetros", wape(predict(final, test), A_test))
    for name, f in {
        "Mediana mismo día, 4 sem. (actual)": median4,
        "Suavizado exp. mismo día": ewma,
        "Por cliente (4 sem.)": cust4,
    }.items():
        show(name, wape(np.stack([f(Y, d).clip(min=0) for d in test], axis=2), A_test))
    boosted = predict(final, test)
    blend = np.stack([cust4(Y, d) for d in test], axis=2)
    combo = 0.5 * boosted + 0.5 * blend
    show("Combinado: boosting afinado + por cliente", wape(combo, A_test))

    # Corrección de nivel: cada día se multiplica por lo vendido / lo predicho de las últimas
    # 4 semanas ya conocidas (hasta 2 días antes), por vendedor. Corrige el sesgo cuando la
    # demanda sube o baja de nivel.
    history = val[-28:] + test  # días con predicción para medir la razón
    pred_all = {}
    for d in history:
        pred_all[d] = 0.5 * final.predict(X[d]).reshape(S, P).clip(min=0) + 0.5 * cust4(Y, d)
    corrected = []
    for d in test:
        window = [k for k in history if d - 30 <= k <= d - 2]
        sold = sum(Y[:, :, k].sum(axis=1) for k in window)
        pred = sum(pred_all[k].sum(axis=1) for k in window)
        ratio = np.clip(sold / np.maximum(pred, 1e-9), 0.7, 1.3)  # límite: no exagerar
        corrected.append(pred_all[d] * ratio[:, None])
    show("Combinado + corrección de nivel (por vendedor)", wape(np.stack(corrected, axis=2), A_test))
    weekly = lambda X: X.sum((0, 1))[: len(test) // 7 * 7].reshape(-1, 7).sum(1)  # noqa: E731
    w = lambda Pm: 100 * np.abs(weekly(Pm) - weekly(A_test)).sum() / weekly(A_test).sum()  # noqa: E731
    print(
        f"equipo×semana: actual {w(np.stack([median4(Y, d) for d in test], axis=2)):.1f}% · "
        f"combinado {w(combo):.1f}% · combinado corregido {w(np.stack(corrected, axis=2)):.1f}%"
    )


if __name__ == "__main__":
    main()
