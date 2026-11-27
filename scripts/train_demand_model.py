"""Compara y entrena modelos para sugerir la proyección del vendedor con la historia de ARIS.

Uso: uv run --project backend python scripts/train_demand_model.py DESPACHO_parte1.csv [más.csv]
(los CSV no se versionan). Validación hacia adelante (rolling origin): cada día de los últimos
TEST días se predice solo con lo conocido hasta HORIZON días antes. Se mide contra lo
DESPACHADO (la venta real), en tres niveles: vendedor×producto×día, vendedor×día y equipo×día
(el que usa la saca). Resultados y decisión: docs/adr/0019.
"""

import json
import re
import sys
from datetime import date

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

KG = [1.0, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0]
HORIZON = 2  # se proyecta el día anterior: lo de ayer aún no está completo
TEST = 120
RETRAIN = 28
# Feriados de Perú 2025-2026 (afectan la demanda de pollo a la brasa).
HOLIDAYS = {
    date(2025, 12, 8), date(2025, 12, 25), date(2026, 1, 1), date(2026, 4, 2), date(2026, 4, 3),
    date(2026, 5, 1), date(2026, 6, 7), date(2026, 6, 29), date(2026, 7, 23), date(2026, 7, 28),
    date(2026, 7, 29), date(2026, 8, 6), date(2026, 8, 30), date(2026, 10, 8), date(2026, 11, 1),
    date(2026, 12, 8), date(2026, 12, 9), date(2026, 12, 25),
}  # fmt: skip


def product(material: str, kg: float, units: float) -> int:
    m = re.search(r"\((\d\.\d\d)-(\d\.\d\d)\)", material)
    w = float(m.group(1)) if m and float(m.group(1)) > 0 else None
    if w is None and units > 0:
        r = kg / units
        w = r if 0.8 <= r <= 2.4 else None
    if w is None:
        return -1
    return max([i for i, k in enumerate(KG) if k <= w + 0.005], default=0)


def load(paths: list[str], min_days: int = 100, unassigned: bool = False):
    """`min_days`: días mínimos con pedidos para incluir a un vendedor. `unassigned`: las líneas
    sin vendedor entran como una serie más («(sin vendedor)»)."""
    d = pd.concat([pd.read_csv(p, low_memory=False) for p in paths], ignore_index=True)
    b = d[d.PedidoDetalleMaterial.str.upper().str.startswith("POLLO ENTERO BRASA", na=False)].copy()
    b["p"] = [
        product(m, k, u)
        for m, k, u in zip(b.PedidoDetalleMaterial, b.PesoDespachado, b.CantidadDespachada)
    ]
    if unassigned:
        b["Vendedor"] = b.Vendedor.fillna("(sin vendedor)")
    b = b[(b.p >= 0) & b.Vendedor.notna()].copy()
    kgu = b.p.map(lambda i: KG[i])
    b["ordered"] = np.where(
        b.PedidoDetalleCantidad > 0, b.PedidoDetalleCantidad, b.PedidoDetalleKilos / kgu
    )
    b["sold"] = np.where(b.CantidadDespachada > 0, b.CantidadDespachada, b.PesoDespachado / kgu)
    b = b[(b.ordered < 20000) & (b.sold < 20000)]
    b["day"] = pd.to_datetime(b.FechaEntrega)
    b["s"] = b.Vendedor.str.lower()
    keep = b.groupby("s").day.nunique()
    sellers = sorted(keep[keep >= min_days].index)
    b = b[b.s.isin(sellers)]
    days = pd.date_range(b.day.min(), b.day.max())
    idx = pd.MultiIndex.from_product([sellers, range(10)], names=["s", "p"])

    def cube(col: str) -> np.ndarray:
        t = b.groupby(["s", "p", "day"])[col].sum().unstack("day").reindex(columns=days)
        return t.reindex(idx).fillna(0).values.reshape(len(sellers), 10, len(days))

    # Por cliente: (cliente, producto, día) de lo vendido, y el vendedor de cada cliente.
    main = b.groupby("PedidoCliente").s.agg(lambda x: x.value_counts().index[0])
    customers = sorted(main.index)
    cidx = pd.MultiIndex.from_product([customers, range(10)], names=["c", "p"])
    ct = b.groupby(["PedidoCliente", "p", "day"]).sold.sum().unstack("day").reindex(columns=days)
    by_customer = ct.reindex(cidx).fillna(0).values.reshape(len(customers), 10, len(days))
    owner = np.array([sellers.index(main[c]) for c in customers])
    return cube("ordered"), cube("sold"), days, sellers, by_customer, owner


# --- Modelos: cada uno devuelve la predicción (vendedor, producto) para un día ---------------


def weekday_lags(Y: np.ndarray, day: int, k: int) -> np.ndarray:
    idx = [day - 7 * j for j in range(1, 80) if day - 7 * j <= day - HORIZON and day - 7 * j >= 0]
    return Y[:, :, idx[:k]]


def median4(Y, day):
    return np.median(weekday_lags(Y, day, 4), axis=2)


def mean4(Y, day):
    return weekday_lags(Y, day, 4).mean(axis=2)


def ewma(Y, day, hl=3, k=12):
    L = weekday_lags(Y, day, k)
    w = 0.5 ** (np.arange(L.shape[2]) / hl)
    return (L * w).sum(axis=2) / w.sum()


def hierarchical(Y, day, k=6, hl=3, mix_days=56):
    """Total del vendedor ese día de la semana (suavizado) × su mezcla de productos reciente."""
    total = ewma(Y.sum(axis=1, keepdims=True), day, hl, k)  # (s, 1)
    hist = Y[:, :, max(0, day - HORIZON - mix_days + 1) : day - HORIZON + 1].sum(axis=2)
    mix = hist / np.maximum(hist.sum(axis=1, keepdims=True), 1e-9)
    return total * mix


def by_customer_model(C, owner, n_sellers, weeks=8, threshold=0.5):
    """Cada cliente: ¿suele pedir ese día de la semana? (al menos la mitad de las últimas
    `weeks` semanas) → su cantidad típica (mediana de las veces que pidió). Se suma por vendedor."""

    def predict(_Y, day):
        lags = weekday_lags(C, day, weeks)  # (cliente, producto, semanas)
        if lags.shape[2] == 0:
            return np.zeros((n_sellers, 10))
        ordered = lags.sum(axis=1) > 0  # (cliente, semanas)
        freq = ordered.mean(axis=1)
        typical = np.zeros(lags.shape[:2])
        for c in np.nonzero(freq >= threshold)[0]:
            typical[c] = np.median(lags[c][:, ordered[c]], axis=1)
        out = np.zeros((n_sellers, 10))
        np.add.at(out, owner, typical)
        return out

    return predict


def features(Y: np.ndarray, days: pd.DatetimeIndex, day: int) -> np.ndarray:
    """Variables de cada (vendedor, producto) para predecir `day` (solo datos ≤ day−HORIZON)."""
    S, P, _ = Y.shape
    lag = weekday_lags(Y, day, 6)
    pad = np.zeros((S, P, 6))
    pad[:, :, : lag.shape[2]] = lag
    last = day - HORIZON
    w7 = Y[:, :, max(0, last - 6) : last + 1].mean(axis=2)
    w28 = Y[:, :, max(0, last - 27) : last + 1].mean(axis=2)
    seller_tot = Y.sum(axis=1)
    st = weekday_lags(seller_tot[:, None, :], day, 4)[:, 0, :]
    st_mean = st.mean(axis=1) if st.shape[1] else np.zeros(S)
    mix = Y[:, :, max(0, last - 55) : last + 1].sum(axis=2)
    mix = mix / np.maximum(mix.sum(axis=1, keepdims=True), 1e-9)
    d = days[day].date()
    cal = [
        d.weekday(),
        d.day,
        d.month,
        float(d in HOLIDAYS),
        float(date.fromordinal(d.toordinal() + 1) in HOLIDAYS),
        float(date.fromordinal(d.toordinal() - 1) in HOLIDAYS),
    ]
    rows = []
    for s in range(S):
        for p in range(P):
            rows.append(
                [s, p, *pad[s, p], pad[s, p, :4].mean(), np.median(pad[s, p, :4]), w7[s, p],
                 w28[s, p], st_mean[s], mix[s, p], st_mean[s] * mix[s, p], *cal]
            )  # fmt: skip
    return np.array(rows)


class Boosting:
    """Gradient boosting global (pérdida Poisson: demanda de conteo e intermitente)."""

    def __init__(self, Y, days, first_test):
        self.Y, self.days = Y, days
        self.model = None
        self.trained_at = -10**9
        self.first = first_test

    def fit(self, upto: int):
        X, y = [], []
        for day in range(42, upto - HORIZON + 1):
            X.append(features(self.Y, self.days, day))
            y.append(self.Y[:, :, day].ravel())
        self.model = HistGradientBoostingRegressor(
            loss="poisson", max_iter=400, learning_rate=0.05, max_leaf_nodes=31,
            min_samples_leaf=20, l2_regularization=1.0, categorical_features=[0, 1],
            random_state=7,
        )  # fmt: skip
        self.model.fit(np.vstack(X), np.concatenate(y))
        self.trained_at = upto

    def __call__(self, Y, day):
        # Reentrena cada RETRAIN días y nunca con días posteriores al que predice (sin fuga).
        if self.model is None or day < self.trained_at or day - self.trained_at >= RETRAIN:
            self.fit(day)
        S, P, _ = Y.shape
        return self.model.predict(features(Y, self.days, day)).reshape(S, P)


# Tamaños como en la saca: chica = Brasa 1-5, mediana = 6-7, grande = 8-10.
SIZES = [range(0, 5), range(5, 7), range(7, 10)]


def _sizes(X):
    """Total del equipo por tamaño y día (lo que se pide a granja)."""
    team = X.sum(axis=0)
    return np.stack([team[list(r)].sum(axis=0) for r in SIZES])


def evaluate(Y_in, Y_true, days, models):
    n = Y_in.shape[2]
    test = range(n - TEST, n)
    out = {}
    for name, f in models.items():
        P = np.stack([np.clip(f(Y_in, day), 0, None) for day in test], axis=2)
        A = Y_true[:, :, list(test)]
        res = {}
        for level, (p, a) in {
            "vendedor×producto×día": (P, A),
            "vendedor×día": (P.sum(axis=1), A.sum(axis=1)),
            "equipo×día": (P.sum(axis=(0, 1)), A.sum(axis=(0, 1))),
            "equipo×semana": (
                P.sum(axis=(0, 1))[: TEST - TEST % 7].reshape(-1, 7).sum(axis=1),
                A.sum(axis=(0, 1))[: TEST - TEST % 7].reshape(-1, 7).sum(axis=1),
            ),
            "tamaño×día": (_sizes(P), _sizes(A)),
        }.items():
            res[level] = round(100 * np.abs(p - a).sum() / a.sum(), 1)
        res["sesgo"] = round(100 * (P.sum() - A.sum()) / A.sum(), 1)
        out[name] = res
        print(f"{name:<52} " + " · ".join(f"{k} {v}%" for k, v in res.items()), flush=True)
    return out


def main() -> None:
    ordered, sold, days, sellers, by_customer, owner = load(sys.argv[1:])
    print(f"vendedores {len(sellers)} · días {len(days)} ({days[0].date()} a {days[-1].date()})")
    cust = by_customer_model(by_customer, owner, len(sellers))
    cust4 = by_customer_model(by_customer, owner, len(sellers), weeks=4)
    cust_low = by_customer_model(by_customer, owner, len(sellers), threshold=0.375)
    boost = Boosting(sold, days, len(days) - TEST)
    boost2 = Boosting(sold, days, len(days) - TEST)
    boost3 = Boosting(sold, days, len(days) - TEST)
    hb = lambda Y, d: hierarchical(Y, d)  # noqa: E731
    models = {
        "Por cliente (8 sem., umbral 50 %)": cust,
        "Por cliente (4 sem., umbral 50 %)": cust4,
        "Por cliente (8 sem., umbral 37,5 %)": cust_low,
        "Combinado: por cliente + suavizado": lambda Y, d: 0.5 * cust(Y, d) + 0.5 * ewma(Y, d),
        "Mediana mismo día, 4 sem. (actual, sobre lo pedido)": lambda Y, d: median4(ordered, d),
        "Mediana mismo día, 4 sem. (sobre lo vendido)": median4,
        "Promedio mismo día, 4 sem.": mean4,
        "Suavizado exp. mismo día (vida media 3 sem.)": ewma,
        "Jerárquico: total del vendedor × mezcla": hb,
        "Gradient boosting Poisson (global, feriados)": boost,
        "Combinado: boosting + jerárquico": lambda Y, d: 0.5 * boost2(Y, d) + 0.5 * hb(Y, d),
        "Combinado: boosting + suavizado + mediana": lambda Y, d: (
            boost3(Y, d) + ewma(Y, d) + median4(Y, d)
        )
        / 3,
    }
    res = evaluate(sold, sold, days, models)
    with open("modelo_demanda_resultados.json", "w", encoding="utf-8") as fh:
        json.dump({"sellers": sellers, "days": [str(days[0].date()), str(days[-1].date())],
                   "horizon": HORIZON, "test_days": TEST, "results": res}, fh, ensure_ascii=False,
                  indent=2)  # fmt: skip


if __name__ == "__main__":
    main()
