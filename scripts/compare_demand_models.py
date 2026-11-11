"""Compara modelos para sugerir la proyección del vendedor, con los pedidos reales de ARIS.

Uso: python scripts/compare_demand_models.py DESPACHO.csv 1 resultado.json
(requiere pandas y scikit-learn; el CSV no se versiona). Validación hacia adelante sobre los
últimos 120 días, por vendedor, producto y día. Resultados y decisión: docs/adr/0012.
"""

import re, sys, json, numpy as np, pandas as pd

KG = [1.0, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0]
d = pd.read_csv(sys.argv[1], low_memory=False)
b = d[d.PedidoDetalleMaterial.str.startswith("POLLO ENTERO BRASA", na=False)].copy()


def prod(row):
    m = re.search(r"\((\d\.\d\d)-(\d\.\d\d)\)", row.PedidoDetalleMaterial)
    w = float(m.group(1)) if m and float(m.group(1)) > 0 else None
    if w is None and row.CantidadDespachada > 0:
        r = row.PesoDespachado / row.CantidadDespachada
        w = r if 0.8 <= r <= 2.4 else None
    if w is None:
        return -1
    return max([i for i, k in enumerate(KG) if k <= w + 0.005], default=0)


b["p"] = [prod(r) for r in b.itertuples()]
print(
    "lineas",
    len(b),
    "sin producto",
    (b.p < 0).mean().round(3),
    "sin vendedor",
    b.Vendedor.isna().mean().round(3),
)
kgshare = b.groupby(b.p < 0).PedidoDetalleKilos.sum()
print("kg sin producto", (kgshare.get(True, 0) / kgshare.sum()).round(3))
b = b[(b.p >= 0) & b.Vendedor.notna()].copy()
b["u"] = np.where(
    b.PedidoDetalleCantidad > 0,
    b.PedidoDetalleCantidad,
    b.PedidoDetalleKilos / b.p.map(lambda i: KG[i]),
)
b = b[b.u < 20000]
b["day"] = pd.to_datetime(b.FechaEntrega)
b["s"] = b.Vendedor.str.lower()
keep = b.groupby("s").day.nunique()
keep = keep[keep >= 100].index
b = b[b.s.isin(keep)]
days = pd.date_range(b.day.min(), b.day.max())
t = b.groupby(["s", "p", "day"]).u.sum().unstack("day").reindex(columns=days).fillna(0)
t = t.reindex(pd.MultiIndex.from_product([sorted(keep), range(10)], names=["s", "p"])).fillna(0)
print("vendedores", len(keep), "dias", len(days), "unidades/dia", round(t.values.sum() / len(days)))
Y = t.values
n = Y.shape[1]
H = int(sys.argv[2]) if len(sys.argv) > 2 else 1
test = range(n - 120, n)


def lagw(day, k):  # mismos días de la semana anteriores disponibles con horizonte H
    idx = [day - 7 * j for j in range(1, 60) if day - 7 * j <= day - H][:k]
    return Y[:, idx]


models = {
    "Misma semana anterior": lambda day: lagw(day, 1)[:, 0],
    "Promedio mismo día, 4 semanas (actual)": lambda day: lagw(day, 4).mean(1),
    "Promedio mismo día, 8 semanas": lambda day: lagw(day, 8).mean(1),
    "Mediana mismo día, 4 semanas": lambda day: np.median(lagw(day, 4), 1),
    "Mediana mismo día, 8 semanas": lambda day: np.median(lagw(day, 8), 1),
    "Promedio de los últimos 28 días": lambda day: Y[:, day - H - 27 : day - H + 1].mean(1),
}
for hl in (2, 4, 8):
    models[f"Suavizado exponencial mismo día, vida media {hl} sem."] = (
        lambda hl: (
            lambda day: (
                lambda L: (
                    (L * 0.5 ** (np.arange(L.shape[1]) / hl)).sum(1)
                    / (0.5 ** (np.arange(L.shape[1]) / hl)).sum()
                )
            )(lagw(day, 12))
        )
    )(hl)


# mezcla: nivel reciente x perfil semanal
def blend(day):
    lvl = Y[:, day - H - 27 : day - H + 1].mean(1)
    prof = lagw(day, 8).mean(1)
    base = Y[:, day - H - 55 : day - H + 1].mean(1)
    return np.where(base > 0, lvl * prof / np.maximum(base, 1e-9), 0)


models["Nivel de 28 días × perfil del día de la semana"] = blend
res = {k: [0.0, 0.0] for k in models}
pred_store = {}
for day in test:
    for k, f in models.items():
        p = f(day)
        res[k][0] += np.abs(p - Y[:, day]).sum()
        res[k][1] += Y[:, day].sum()
        pred_store.setdefault(k, []).append(p)
# ML global
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge


def feats(day):
    L = lagw(day, 8)
    r = Y[:, day - H - 27 : day - H + 1]
    return np.column_stack(
        [
            L,
            L[:, :4].mean(1),
            L.mean(1),
            np.median(L[:, :4], 1),
            r.mean(1),
            r[:, -7:].mean(1),
            (L > 0).mean(1),
            np.full(len(Y), day % 7),
            np.arange(len(Y)) % 10,
            np.arange(len(Y)) // 10,
        ]
    )


start = 60 + H
for name, mk in {
    "Ridge": lambda: Ridge(1.0),
    "Random forest": lambda: RandomForestRegressor(
        100, min_samples_leaf=5, random_state=0, n_jobs=1
    ),
    "Gradient boosting (árboles)": lambda: HistGradientBoostingRegressor(
        max_iter=200, learning_rate=0.05, loss="absolute_error", random_state=0
    ),
    "Gradient boosting (error cuadrático)": lambda: HistGradientBoostingRegressor(
        max_iter=200, learning_rate=0.05, random_state=0
    ),
}.items():
    e = tot = 0
    m = None
    for i, day in enumerate(test):
        if i % 14 == 0:  # reentrena cada 2 semanas con todo lo anterior
            X = np.vstack([feats(dd) for dd in range(start, day - H + 1)])
            y = np.concatenate([Y[:, dd] for dd in range(start, day - H + 1)])
            m = mk().fit(X, y)
        p = np.maximum(m.predict(feats(day)), 0)
        e += np.abs(p - Y[:, day]).sum()
        tot += Y[:, day].sum()
    res[name] = [e, tot]
    print(name, round(e / tot * 100, 1), flush=True)
out = sorted(((k, round(v[0] / v[1] * 100, 1)) for k, v in res.items()), key=lambda x: x[1])
for k, v in out:
    print(f"{v:6.1f}  {k}")
json.dump(out, open(sys.argv[3], "w"), ensure_ascii=False)
