"""Compara modelos para predecir en qué rango (B0..B9) llega lo que se pide a granja.

Uso (el Excel NO va al repositorio: tiene datos reales del negocio):
    python scripts/compare_production_models.py DESVIACION_Y_AHOGADOS.xlsx [salida.json]

Tarea: para el día t se conoce lo pedido por tipo (chica, mediana, grande) y toda la historia
anterior; hay que estimar las aves producidas por rango. Validación hacia adelante (walk-forward):
cada día se predice solo con días anteriores. Métrica principal: WAPE por rango y día
(suma de errores absolutos / suma de lo producido). Requiere pandas, openpyxl y scikit-learn.
"""

import json
import re
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.neighbors import KNeighborsRegressor
from sklearn.tree import DecisionTreeRegressor

RANGES = [f"B{i}" for i in range(10)]
TYPE = {**{f"B{i}": "chica" for i in range(5)}, "B5": "mediana", "B6": "mediana",
        "B7": "grande", "B8": "grande", "B9": "grande"}
TYPES = ["chica", "mediana", "grande"]
START = 60  # días de historia antes de empezar a evaluar


def load(path: str) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    raw = pd.read_excel(path, sheet_name="DB_CALIDA_B", header=None)
    head = raw.index[raw.apply(lambda r: r.astype(str).str.strip().eq("FECHA").any(), axis=1)][0]
    col = list(raw.loc[head].astype(str).str.strip()).index("FECHA")
    x = raw.iloc[head + 1:, col:col + 13].copy()
    x.columns = ["fecha", "tipo", "granja", "galpon", "und", "peso", "cant", "dens",
                 "pedido", "rango", "prod", "a", "b"]
    x["fecha"] = pd.to_datetime(x.fecha, errors="coerce")
    x = x[x.fecha.notna() & x.rango.isin(RANGES)]
    for c in ("pedido", "prod", "b"):
        x[c] = pd.to_numeric(x[c], errors="coerce").fillna(0)
    x["t"] = x.rango.map(TYPE)
    ordered = x.pivot_table(index="fecha", columns="t", values="pedido", aggfunc="sum")[TYPES]
    produced = x.pivot_table(index="fecha", columns="rango", values="prod", aggfunc="sum")[RANGES]
    as_ordered = x.pivot_table(index="fecha", columns="rango", values="pedido", aggfunc="sum")[RANGES]
    ok = (ordered.sum(axis=1) > 0) & (produced.sum(axis=1) > 0)
    # Peso promedio de la parvada por tipo ("2.33 Y 2.32" = varios galpones): se conoce al pedir.
    x["w"] = [_flock_weight(v) for v in x.peso]
    weights = x.pivot_table(index="fecha", columns="t", values="w", aggfunc="mean").reindex(columns=TYPES)
    WEIGHTS.update({"df": weights.reindex(ordered.index)[ok].ffill().bfill()})
    return ordered[ok], produced[ok], as_ordered[ok]


WEIGHTS: dict = {}


def _flock_weight(value: object) -> float:
    found = re.findall(r"\d+(?:\.\d+)?", str(value)) if value is not None else []
    numbers = [float(n) for n in found if 0.5 < float(n) < 5]
    return float(np.mean(numbers)) if numbers else float("nan")


def ratio_of_sums(prod: pd.DataFrame, ordered: pd.DataFrame, weights: np.ndarray | None = None) -> dict:
    """Aves del rango por cada ave pedida de su tipo, sobre una ventana (opcionalmente ponderada)."""
    w = np.ones(len(prod)) if weights is None else weights
    return {r: float((prod[r].values * w).sum() / max((ordered[TYPE[r]].values * w).sum(), 1e-9))
            for r in RANGES}


def window(n: int | None):
    def model(prod, ordered, i):
        lo = 0 if n is None else max(0, i - n)
        return ratio_of_sums(prod.iloc[lo:i], ordered.iloc[lo:i])
    return model


def ewma(half_life: float):
    def model(prod, ordered, i):
        age = np.arange(i, 0, -1) - 1
        return ratio_of_sums(prod.iloc[:i], ordered.iloc[:i], 0.5 ** (age / half_life))
    return model


def weekday(weeks: int):
    def model(prod, ordered, i):
        day = prod.index[i].dayofweek
        same = [j for j in range(i) if prod.index[j].dayofweek == day][-weeks:]
        if len(same) < 3:
            return window(28)(prod, ordered, i)
        return ratio_of_sums(prod.iloc[same], ordered.iloc[same])
    return model


def median_ratio(n: int):
    def model(prod, ordered, i):
        out = {}
        for r in RANGES:
            o = ordered[TYPE[r]].iloc[i - n:i]
            daily = (prod[r].iloc[i - n:i] / o.where(o > 0)).dropna()
            out[r] = float(daily.median()) if len(daily) else 0.0
        return out
    return model


def features(prod: pd.DataFrame, ordered: pd.DataFrame, flock_weight: bool = False) -> tuple[np.ndarray, np.ndarray]:
    """Para los modelos de ML: razones pasadas (medias 7 y 28 días), día de semana y lo pedido.
    `flock_weight` agrega el peso promedio de la parvada de cada tipo."""
    ratios = pd.DataFrame({r: prod[r] / ordered[TYPE[r]].where(ordered[TYPE[r]] > 0) for r in RANGES})
    past = ratios.shift(1)
    cols = [past.rolling(7, min_periods=3).mean().add_suffix("_m7"),
            past.rolling(28, min_periods=7).mean().add_suffix("_m28"),
            np.log1p(ordered).add_suffix("_log"),
            pd.get_dummies(pd.Series(prod.index.dayofweek, index=prod.index), prefix="dow").astype(float)]
    if flock_weight:
        cols.append(WEIGHTS["df"].add_suffix("_peso"))
    return pd.concat(cols, axis=1).fillna(0).values, ratios.fillna(0).values


def learned(make, retrain_every: int = 7, flock_weight: bool = False, residual_of=None):
    """`residual_of`: el modelo aprende solo la corrección sobre otro (híbrido)."""
    state: dict = {}

    def model(prod, ordered, i):
        if "X" not in state:
            state["X"], state["Y"] = features(prod, ordered, flock_weight)
            if residual_of is not None:
                base = np.array([[residual_of(prod, ordered, j)[r] if j >= 28 else 0.0 for r in RANGES]
                                 for j in range(len(prod))])
                state["base"], state["Y"] = base, state["Y"] - base
        if state.get("fit_at") is None or i - state["fit_at"] >= retrain_every:
            state["models"] = [make().fit(state["X"][28:i], state["Y"][28:i, k]) for k in range(len(RANGES))]
            state["fit_at"] = i
        row = state["X"][i:i + 1]
        add = state["base"][i] if residual_of is not None else np.zeros(len(RANGES))
        return {r: float(max(0.0, m.predict(row)[0] + add[k]))
                for k, (r, m) in enumerate(zip(RANGES, state["models"]))}
    return model


MODELS = {
    "Sin modelo: llega lo pedido": None,
    "Histórico, toda la historia": window(None),
    "Histórico, últimos 7 días": window(7),
    "Histórico, últimos 14 días": window(14),
    "Histórico, últimos 28 días": window(28),
    "Histórico, últimos 56 días": window(56),
    "Suavizado exponencial (vida media 7 días)": ewma(7),
    "Suavizado exponencial (vida media 14 días)": ewma(14),
    "Suavizado exponencial (vida media 28 días)": ewma(28),
    "Mismo día de la semana (8 semanas)": weekday(8),
    "Mediana diaria, últimos 28 días": median_ratio(28),
    "ML: regresión Ridge": learned(lambda: Ridge(alpha=1.0)),
    "ML: árbol de decisión": learned(lambda: DecisionTreeRegressor(max_depth=4, min_samples_leaf=8, random_state=0)),
    "ML: random forest": learned(lambda: RandomForestRegressor(n_estimators=100, min_samples_leaf=4, random_state=0)),
    "ML: extra trees": learned(lambda: ExtraTreesRegressor(n_estimators=100, min_samples_leaf=4, random_state=0)),
    "ML: gradient boosting": learned(lambda: HistGradientBoostingRegressor(max_iter=150, max_depth=3, learning_rate=0.05)),
    "ML: vecinos cercanos (k=10)": learned(lambda: KNeighborsRegressor(n_neighbors=10, weights="distance")),
    "ML: random forest + peso de la parvada": learned(
        lambda: RandomForestRegressor(n_estimators=100, min_samples_leaf=4, random_state=0), flock_weight=True),
    "ML: gradient boosting + peso de la parvada": learned(
        lambda: HistGradientBoostingRegressor(max_iter=150, max_depth=3, learning_rate=0.05), flock_weight=True),
    "Híbrido: suavizado + gradient boosting sobre el error": learned(
        lambda: HistGradientBoostingRegressor(max_iter=80, max_depth=2, learning_rate=0.05),
        flock_weight=True, residual_of=ewma(7)),
}


def wape(est: np.ndarray, real: np.ndarray) -> float:
    return float(np.abs(est - real).sum() / real.sum())


def by_type(m: np.ndarray) -> np.ndarray:
    return np.stack([m[:, [k for k, r in enumerate(RANGES) if TYPE[r] == t]].sum(axis=1) for t in TYPES], axis=1)


def main() -> None:
    ordered, produced, as_ordered = load(sys.argv[1])
    real = produced.values[START:]
    results = []
    for name, model in MODELS.items():
        if model is None:
            est = as_ordered.values[START:]
        else:
            est = np.array([[model(produced, ordered, i)[r] * ordered.iloc[i][TYPE[r]] for r in RANGES]
                            for i in range(START, len(produced))])
        print(f"  listo: {name}", file=sys.stderr, flush=True)
        results.append({"modelo": name, "wape_rango": wape(est, real), "wape_tipo": wape(by_type(est), by_type(real)),
                        "mae_aves": float(np.abs(est - real).mean())})
    results.sort(key=lambda r: r["wape_rango"])
    summary = {"dias": len(produced), "evaluados": len(real), "desde": str(produced.index[0].date()),
               "hasta": str(produced.index[-1].date()), "resultados": results}
    print(f"{summary['dias']} días útiles ({summary['desde']} a {summary['hasta']}), {summary['evaluados']} evaluados\n")
    print(f"{'modelo':56s} {'por rango':>10s} {'por tipo':>9s} {'MAE aves':>9s}")
    for r in results:
        print(f"{r['modelo']:56s} {r['wape_rango']:>10.1%} {r['wape_tipo']:>9.1%} {r['mae_aves']:>9.0f}")
    if len(sys.argv) > 2:
        with open(sys.argv[2], "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
