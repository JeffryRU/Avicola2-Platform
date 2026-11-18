# ruff: noqa: N803, N806, PLR2004 — notación de matrices (Y, X, C) y umbrales del modelo
"""Modelos de demanda (numpy + scikit-learn): los mismos de notebooks/modelo_demanda.ipynb.

Trabajan sobre un cubo (vendedor, producto, día) de unidades despachadas y predicen el día `d`
con información hasta `d − HORIZON`. Ver ADR 0020.
"""

from datetime import date, timedelta

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

HORIZON = 2  # se proyecta el día anterior: lo de ayer aún no está completo
FIRST = 42  # días de historia mínimos para armar las variables
SIZES = (range(4), range(4, 6), range(6, 10))  # chica = Brasa 1-4, mediana = 5-6, grande = 7-10
# Feriados de Perú (la demanda de pollo a la brasa cambia esos días y alrededor).
HOLIDAYS = {
    date(2025, 12, 8), date(2025, 12, 25), date(2026, 1, 1), date(2026, 4, 2), date(2026, 4, 3),
    date(2026, 5, 1), date(2026, 6, 7), date(2026, 6, 29), date(2026, 7, 23), date(2026, 7, 28),
    date(2026, 7, 29), date(2026, 8, 6), date(2026, 8, 30), date(2026, 10, 8), date(2026, 11, 1),
    date(2026, 12, 8), date(2026, 12, 9), date(2026, 12, 25),
}  # fmt: skip
GBM = {
    "loss": "poisson", "learning_rate": 0.05, "max_leaf_nodes": 31, "min_samples_leaf": 80,
    "l2_regularization": 1.0, "max_iter": 150, "categorical_features": [0, 1], "random_state": 7,
}  # fmt: skip


def weekday_lags(Y: np.ndarray, day: int, k: int) -> np.ndarray:
    """Los últimos `k` días iguales de la semana disponibles (del más reciente al más antiguo)."""
    idx = [day - 7 * j for j in range(1, 80) if 0 <= day - 7 * j <= day - HORIZON]
    return Y[:, :, idx[:k]]


def median4(Y, day):
    lags = weekday_lags(Y, day, 4)
    return np.median(lags, axis=2) if lags.shape[2] else np.zeros(Y.shape[:2])


def ewma(Y, day, hl=3, k=12):
    L = weekday_lags(Y, day, k)
    if not L.shape[2]:
        return np.zeros(Y.shape[:2])
    w = 0.5 ** (np.arange(L.shape[2]) / hl)
    return (L * w).sum(axis=2) / w.sum()


def croston(Y, day, kind: str, alpha=0.15, beta=0.15):
    """SBA o TSB sobre los mismos días de la semana (12 semanas)."""
    L = weekday_lags(Y, day, 12)[:, :, ::-1]
    S, P = Y.shape[:2]
    out = np.zeros((S, P))
    for s in range(S):
        for p in range(P):
            y = L[s, p]
            nz = np.nonzero(y)[0]
            if not len(nz):
                continue
            if kind == "tsb":
                prob, size = (y > 0).mean(), y[nz].mean()
                for v in y:
                    prob += beta * ((v > 0) - prob)
                    if v > 0:
                        size += alpha * (v - size)
                out[s, p] = prob * size
            else:
                z, q, gap = y[nz[0]], max(nz[0] + 1, 1), 1
                for v in y[nz[0] + 1 :]:
                    if v > 0:
                        z, q, gap = z + alpha * (v - z), q + alpha * (gap - q), 1
                    else:
                        gap += 1
                out[s, p] = z / q * (1 - alpha / 2)
    return out


def by_customer(C: np.ndarray, owner: np.ndarray, n_sellers: int, weeks=4):
    """Cada cliente que suele pedir ese día de la semana, con su cantidad típica; por vendedor."""

    def predict(_Y, day):
        lags = weekday_lags(C, day, weeks)
        out = np.zeros((n_sellers, C.shape[1]))
        if not lags.shape[2]:
            return out
        ordered = lags.sum(axis=1) > 0
        freq = ordered.mean(axis=1)
        typical = np.zeros(lags.shape[:2])
        for c in np.nonzero(freq >= 0.5)[0]:
            typical[c] = np.median(lags[c][:, ordered[c]], axis=1)
        np.add.at(out, owner, typical)
        return out

    return predict


def features(Y: np.ndarray, days: list[date], day: int) -> np.ndarray:
    """Variables de cada (vendedor, producto) para predecir `day` (solo datos ≤ day − HORIZON)."""
    S, P, _ = Y.shape
    lag = weekday_lags(Y, day, 6)
    pad = np.zeros((S, P, 6))
    pad[:, :, : lag.shape[2]] = lag
    last = day - HORIZON
    w7 = Y[:, :, max(0, last - 6) : last + 1].mean(axis=2)
    w28 = Y[:, :, max(0, last - 27) : last + 1].mean(axis=2)
    st = weekday_lags(Y.sum(axis=1)[:, None, :], day, 4)[:, 0, :]
    st_mean = st.mean(axis=1) if st.shape[1] else np.zeros(S)
    mix = Y[:, :, max(0, last - 55) : last + 1].sum(axis=2)
    mix = mix / np.maximum(mix.sum(axis=1, keepdims=True), 1e-9)
    d = days[day]
    cal = [
        d.weekday(), d.day, d.month, float(d in HOLIDAYS),
        float(d + timedelta(days=1) in HOLIDAYS), float(d - timedelta(days=1) in HOLIDAYS),
    ]  # fmt: skip
    rows = []
    for s in range(S):
        for p in range(P):
            rows.append(  # noqa: PERF401
                [s, p, *pad[s, p], pad[s, p, :4].mean(), np.median(pad[s, p, :4]), w7[s, p],
                 w28[s, p], st_mean[s], mix[s, p], st_mean[s] * mix[s, p], *cal]
            )  # fmt: skip
    return np.array(rows)


def fit(X: np.ndarray, y: np.ndarray) -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(**GBM).fit(X, y)


def wape(P: np.ndarray, A: np.ndarray) -> dict[str, float]:
    """Error (WAPE, %) por nivel de la app, más el sesgo. P y A: (vendedor, producto, día)."""
    k = A.shape[2] // 7 * 7
    week = lambda v: v[:k].reshape(-1, 7).sum(1)  # noqa: E731
    size = lambda X: np.stack([X.sum(0)[list(r)].sum(0) for r in SIZES])  # noqa: E731
    e = lambda p, a: float(100 * np.abs(p - a).sum() / max(a.sum(), 1e-9))  # noqa: E731
    team_p, team_a = P.sum((0, 1)), A.sum((0, 1))
    return {
        "detalle": e(P, A),
        "vendedor_dia": e(P.sum(1), A.sum(1)),
        "tamano_dia": e(size(P), size(A)),
        "equipo_dia": e(team_p, team_a),
        "equipo_semana": e(week(team_p), week(team_a)) if k else 0.0,
        "sesgo": float(100 * (P.sum() - A.sum()) / max(A.sum(), 1e-9)),
    }
