# ruff: noqa: N803, N806 — notación de matrices (Y, X, C)
"""Modelos de demanda (numpy + scikit-learn): los mismos de notebooks/modelo_demanda.ipynb.

Trabajan sobre un cubo (vendedor, producto, día) de unidades despachadas y predicen el día `d`
con información hasta `d − HORIZON`. Ver ADR 0020.
"""

from datetime import date, timedelta
from functools import lru_cache

import numpy as np
import yaml
from sklearn.ensemble import HistGradientBoostingRegressor

from app.core.config import get_settings

HORIZON = 2  # se proyecta el día anterior: lo de ayer aún no está completo
FIRST = 42  # días de historia mínimos para armar las variables
# Feriados (la demanda de pollo a la brasa cambia esos días y alrededor): config/feriados.yaml.
FERIADOS_FILE = "feriados.yaml"


@lru_cache
def holidays() -> frozenset[date]:
    path = get_settings().config_dir / FERIADOS_FILE
    if not path.is_file():
        return frozenset()
    with path.open(encoding="utf-8") as fh:
        return frozenset(date.fromisoformat(str(d)) for d in yaml.safe_load(fh)["feriados"])


def sizes_of(groups: list[str]) -> tuple[range, ...]:
    """Posiciones de cada tamaño, en el orden del catálogo (los productos vienen agrupados)."""
    out: list[range] = []
    start = 0
    for i in range(1, len(groups) + 1):
        if i == len(groups) or groups[i] != groups[start]:
            out.append(range(start, i))
            start = i
    return tuple(out)


# Hiperparámetros de los modelos simples (también se muestran en «Modelo de demanda»).
MEDIAN_WEEKS = 4  # mediana de los últimos 4 días iguales de la semana
EWMA_WEEKS = 12  # suavizado: 12 semanas…
EWMA_HALF_LIFE = 3  # …con vida media de 3 semanas
CROSTON_WEEKS = 12
CROSTON_ALPHA = 0.15  # suavizado del tamaño del pedido
CROSTON_BETA = 0.15  # suavizado de la probabilidad de pedir (TSB)
CUSTOMER_WEEKS = 4
CUSTOMER_MIN_FREQ = 0.5  # el cliente cuenta si pidió al menos la mitad de esos días

GBM = {
    "loss": "poisson", "learning_rate": 0.05, "max_leaf_nodes": 31, "min_samples_leaf": 80,
    "l2_regularization": 1.0, "max_iter": 150, "categorical_features": [0, 1], "random_state": 7,
}  # fmt: skip


def weekday_lags(Y: np.ndarray, day: int, k: int) -> np.ndarray:
    """Los últimos `k` días iguales de la semana disponibles (del más reciente al más antiguo)."""
    idx = [day - 7 * j for j in range(1, 80) if 0 <= day - 7 * j <= day - HORIZON]
    return Y[:, :, idx[:k]]


def median4(Y, day):
    lags = weekday_lags(Y, day, MEDIAN_WEEKS)
    return np.median(lags, axis=2) if lags.shape[2] else np.zeros(Y.shape[:2])


def ewma(Y, day, hl=EWMA_HALF_LIFE, k=EWMA_WEEKS):
    L = weekday_lags(Y, day, k)
    if not L.shape[2]:
        return np.zeros(Y.shape[:2])
    w = 0.5 ** (np.arange(L.shape[2]) / hl)
    return (L * w).sum(axis=2) / w.sum()


def croston(Y, day, kind: str, alpha=CROSTON_ALPHA, beta=CROSTON_BETA):
    """SBA o TSB sobre los mismos días de la semana (12 semanas)."""
    L = weekday_lags(Y, day, CROSTON_WEEKS)[:, :, ::-1]
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


def by_customer(C: np.ndarray, owner: np.ndarray, n_sellers: int, weeks=CUSTOMER_WEEKS):
    """Cada cliente que suele pedir ese día de la semana, con su cantidad típica; por vendedor."""

    def predict(_Y, day):
        lags = weekday_lags(C, day, weeks)
        out = np.zeros((n_sellers, C.shape[1]))
        if not lags.shape[2]:
            return out
        ordered = lags.sum(axis=1) > 0
        freq = ordered.mean(axis=1)
        typical = np.zeros(lags.shape[:2])
        for c in np.nonzero(freq >= CUSTOMER_MIN_FREQ)[0]:
            typical[c] = np.median(lags[c][:, ordered[c]], axis=1)
        np.add.at(out, owner, typical)
        return out

    return predict


# Nombre de cada variable de `features` (en el mismo orden), para mostrarlas en la app.
FEATURES = [
    "vendedor", "producto",
    *(f"mismo día hace {k} sem." for k in range(1, 7)),
    "promedio 4 sem.", "mediana 4 sem.", "promedio 7 días", "promedio 28 días",
    "total del vendedor (4 sem.)", "peso del producto en el vendedor", "total × peso",
    "día de la semana", "día del mes", "mes",
    "feriado", "víspera de feriado", "día después de feriado",
]  # fmt: skip


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
    feriados = holidays()
    cal = [
        d.weekday(), d.day, d.month, float(d in feriados),
        float(d + timedelta(days=1) in feriados), float(d - timedelta(days=1) in feriados),
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


def wape(P: np.ndarray, A: np.ndarray, sizes: tuple[range, ...]) -> dict[str, float]:
    """Error (WAPE, %) por nivel de la app, más el sesgo. P y A: (vendedor, producto, día);
    `sizes`: las posiciones de cada tamaño (ver `sizes_of`)."""
    k = A.shape[2] // 7 * 7
    week = lambda v: v[:k].reshape(-1, 7).sum(1)  # noqa: E731
    size = lambda X: np.stack([X.sum(0)[list(r)].sum(0) for r in sizes])  # noqa: E731
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


def breakdown(
    P: np.ndarray, A: np.ndarray, sizes: tuple[range, ...], weekdays: list[int]
) -> dict[str, object]:
    """Detalle del error de un modelo en los días evaluados (P y A: vendedor, producto, día).

    - `mae` y `rmse`: unidades por vendedor y día (cuánto se equivoca en promedio con cada uno).
    - `por_tamano`: WAPE de cada tamaño por día.
    - `matriz`: WAPE de cada tamaño (filas) en cada día de la semana (columnas, lunes = 0).
    Sin pedidos reales (o sin ese día de la semana) el error no existe: None, no un número enorme.
    """
    pv, av = P.sum(1), A.sum(1)  # vendedor × día
    err = pv - av
    by_size_p = np.stack([P.sum(0)[list(r)].sum(0) for r in sizes])  # tamaño × día
    by_size_a = np.stack([A.sum(0)[list(r)].sum(0) for r in sizes])

    def e(p: np.ndarray, a: np.ndarray) -> float | None:
        return float(100 * np.abs(p - a).sum() / a.sum()) if a.sum() > 0 else None

    wd = np.array(weekdays)
    matrix = [
        [e(by_size_p[s, wd == w], by_size_a[s, wd == w]) for w in range(7)]
        for s in range(len(sizes))
    ]
    return {
        "mae": float(np.abs(err).mean()),
        "rmse": float(np.sqrt((err**2).mean())),
        "por_tamano": [e(by_size_p[s], by_size_a[s]) for s in range(len(sizes))],
        "matriz": matrix,
    }
