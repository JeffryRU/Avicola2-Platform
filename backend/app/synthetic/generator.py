"""Generador de datos sintéticos de demanda, proyecciones, saca y excedentes.

SUPUESTO: mientras no haya históricos reales de Avícola 2 se trabaja con estos datos
(docs/assumptions.md). Los niveles, perfiles y efectos de abajo son inventados pero
plausibles; sirven para probar la ingesta, el forecast y el dashboard.

Modelo:
    demanda(día, canal, producto) = base · perfil_semanal · tendencia · estacionalidad_anual
                                    · efecto_eventos · ruido
    La demanda se reparte entre clientes. La saca la planifica "Producción" una semana antes
    con un naive estacional ajustado por calendario. Si el pollo no alcanza, los pedidos se
    recortan (demanda censurada); si sobra, se registra un excedente con su destino.
"""

import json
from dataclasses import asdict, dataclass, field
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from app.ml import calendar as cal

# kg de producto por día, por canal y producto (nivel base al inicio de la serie).
BASE_KG: dict[str, dict[str, float]] = {
    "Horeca": {"Pollo brasa": 5200, "Pollo entero": 900, "Pechuga": 500, "Alas": 300},
    "Supermercados": {
        "Pollo entero": 1800,
        "Pechuga": 1300,
        "Pierna": 900,
        "Alas": 400,
        "Menudencia": 300,
    },
    "Tiendas": {"Pollo entero": 1200, "Pechuga": 600, "Pierna": 500, "Menudencia": 250},
}

# Perfil por día de la semana (lunes … domingo), se normaliza a media 1.
WEEKLY_PROFILE: dict[str, list[float]] = {
    "Horeca": [0.80, 0.82, 0.88, 0.95, 1.12, 1.30, 1.35],
    "Supermercados": [0.90, 0.88, 0.92, 0.95, 1.05, 1.25, 1.05],
    "Tiendas": [1.00, 1.00, 1.00, 1.02, 1.05, 1.06, 0.87],
}

# Efecto multiplicativo de cada evento por canal.
EVENT_EFFECT: dict[str, dict[str, float]] = {
    cal.HOLIDAY: {"Horeca": 1.20, "Supermercados": 1.08, "Tiendas": 0.85},
    cal.FIESTAS_PATRIAS: {"Horeca": 1.35, "Supermercados": 1.15, "Tiendas": 1.00},
    cal.MOTHERS_DAY: {"Horeca": 1.70, "Supermercados": 1.10, "Tiendas": 1.00},
    cal.POLLO_A_LA_BRASA_DAY: {"Horeca": 1.30, "Supermercados": 1.00, "Tiendas": 1.00},
    cal.CHRISTMAS_EVE: {"Horeca": 0.90, "Supermercados": 1.60, "Tiendas": 1.30},
    cal.CHRISTMAS: {"Horeca": 0.70, "Supermercados": 0.60, "Tiendas": 0.60},
    cal.NEW_YEARS_EVE: {"Horeca": 1.20, "Supermercados": 1.40, "Tiendas": 1.20},
    cal.NEW_YEAR: {"Horeca": 0.60, "Supermercados": 0.50, "Tiendas": 0.50},
}

# Efectos adicionales por producto (sobre el efecto del canal).
PRODUCT_EVENT_EFFECT: dict[tuple[str, str], float] = {
    (cal.POLLO_A_LA_BRASA_DAY, "Pollo brasa"): 2.0,
    (cal.MOTHERS_DAY, "Pollo brasa"): 1.2,
}

CUSTOMERS_PER_CHANNEL = {"Horeca": 5, "Supermercados": 3, "Tiendas": 6}
CUSTOMER_PREFIX = {"Horeca": "HOR", "Supermercados": "SUP", "Tiendas": "TIE"}

# Sesgo y error de las proyecciones que envía cada canal (Horeca tiende a sobreestimar).
PROJECTION_BIAS = {"Horeca": 0.06, "Supermercados": -0.02, "Tiendas": 0.0}
PROJECTION_SOURCE = {"Horeca": "message", "Supermercados": "excel", "Tiendas": "excel"}

SURPLUS_DESTINATIONS = ["recategorize", "next_day", "discard"]
SURPLUS_DESTINATION_P = [0.5, 0.35, 0.15]


@dataclass(frozen=True)
class SyntheticConfig:
    end: date
    days: int = 548  # ~18 meses
    seed: int = 42
    trend_per_year: float = 0.06
    yearly_amplitude: float = 0.04
    noise_sigma: float = 0.08
    projection_sigma: float = 0.10
    customer_concentration: float = 80.0  # mayor = reparto entre clientes más estable
    plan_margin: float = 0.05  # margen que agrega Producción al planificar la saca
    plan_calendar_awareness: float = 0.7  # 0 = ignora feriados al planificar, 1 = los anticipa
    live_weight_sigma: float = 0.015  # variación del peso real de la saca vs. lo planificado
    yield_factor: float = 0.75
    avg_live_weight_kg: float = 2.6

    @property
    def start(self) -> date:
        return (pd.Timestamp(self.end) - pd.Timedelta(days=self.days - 1)).date()


@dataclass
class SyntheticDataset:
    orders: pd.DataFrame
    projections: pd.DataFrame
    saca: pd.DataFrame
    surplus_events: pd.DataFrame
    config: SyntheticConfig
    summary: dict[str, float] = field(default_factory=dict)


def _series_index(dates: pd.DatetimeIndex) -> pd.DataFrame:
    pairs = [(c, p) for c, products in BASE_KG.items() for p in products]
    idx = pd.MultiIndex.from_product([dates, range(len(pairs))], names=["date", "pair"])
    df = idx.to_frame(index=False)
    df["channel"] = [pairs[i][0] for i in df["pair"]]
    df["product"] = [pairs[i][1] for i in df["pair"]]
    return df.drop(columns="pair")


def _event_multiplier(df: pd.DataFrame, events: pd.DataFrame) -> np.ndarray:
    mult = np.ones(len(df))
    for event_date, event in events[["date", "event"]].itertuples(index=False):
        on_day = (df["date"] == event_date).to_numpy()
        if not on_day.any():
            continue
        channel_effect = df.loc[on_day, "channel"].map(EVENT_EFFECT[event]).to_numpy()
        product_effect = (
            df.loc[on_day, "product"]
            .map(lambda p, e=event: PRODUCT_EVENT_EFFECT.get((e, p), 1.0))
            .to_numpy()
        )
        mult[on_day] *= channel_effect * product_effect
    return mult


def _expected_demand(df: pd.DataFrame, cfg: SyntheticConfig, events: pd.DataFrame) -> np.ndarray:
    """Demanda esperada sin ruido (la usa también el planificador de la saca)."""
    base = np.array([BASE_KG[c][p] for c, p in zip(df["channel"], df["product"], strict=True)])
    profiles = {c: np.array(v) / np.mean(v) for c, v in WEEKLY_PROFILE.items()}
    dow = df["date"].dt.dayofweek.to_numpy()
    weekly = np.array([profiles[c][d] for c, d in zip(df["channel"], dow, strict=True)])
    t_years = (df["date"] - pd.Timestamp(cfg.start)).dt.days.to_numpy() / 365.25
    trend = 1 + cfg.trend_per_year * t_years
    yearly = 1 + cfg.yearly_amplitude * np.sin(2 * np.pi * df["date"].dt.dayofyear / 365.25)
    return base * weekly * trend * yearly.to_numpy() * _event_multiplier(df, events)


def _split_customers(
    demand: pd.DataFrame, cfg: SyntheticConfig, rng: np.random.Generator
) -> pd.DataFrame:
    parts = []
    for channel, n in CUSTOMERS_PER_CHANNEL.items():
        names = [f"{CUSTOMER_PREFIX[channel]}-{i:02d}" for i in range(1, n + 1)]
        base_share = rng.dirichlet(np.full(n, 2.0))
        rows = demand[demand["channel"] == channel]
        shares = rng.gamma(base_share * cfg.customer_concentration, size=(len(rows), n))
        shares /= shares.sum(axis=1, keepdims=True)
        for j, name in enumerate(names):
            part = rows[["date", "channel", "product"]].copy()
            part["customer"] = name
            part["ordered_kg"] = rows["demand_kg"].to_numpy() * shares[:, j]
            parts.append(part)
    return pd.concat(parts, ignore_index=True)


def _plan_saca(
    demand: pd.DataFrame, cfg: SyntheticConfig, rng: np.random.Generator
) -> pd.DataFrame:
    daily = demand.groupby("date")[["demand_kg", "expected_kg"]].sum()
    # Producción planifica con lo vendido el mismo día de la semana anterior, ajustado
    # (en parte) por lo que sabe del calendario, más un margen.
    prev_demand = daily["demand_kg"].shift(7).fillna(daily["demand_kg"].iloc[:7].mean())
    prev_expected = daily["expected_kg"].shift(7).fillna(daily["expected_kg"].iloc[:7].mean())
    calendar_ratio = (daily["expected_kg"] / prev_expected) ** cfg.plan_calendar_awareness
    planned_product = prev_demand * calendar_ratio * (1 + cfg.plan_margin)

    saca = pd.DataFrame(index=daily.index)
    saca["planned_kg"] = planned_product / cfg.yield_factor  # kg vivos
    saca["planned_birds"] = np.round(saca["planned_kg"] / cfg.avg_live_weight_kg).astype(int)
    saca["actual_kg"] = saca["planned_kg"] * rng.normal(1, cfg.live_weight_sigma, len(saca))
    available = saca["actual_kg"] * cfg.yield_factor
    saca["demand_kg"] = daily["demand_kg"]
    saca["cut_pct"] = (1 - available / daily["demand_kg"]).clip(lower=0)
    saca["surplus_kg"] = (available - daily["demand_kg"]).clip(lower=0)
    return saca.reset_index()


def _surplus_events(
    demand: pd.DataFrame, saca: pd.DataFrame, rng: np.random.Generator
) -> pd.DataFrame:
    by_product = demand.groupby(["date", "product"])["demand_kg"].sum().reset_index()
    by_product = by_product.merge(
        saca[["date", "demand_kg", "surplus_kg"]], on="date", suffixes=("", "_day")
    )
    by_product = by_product[by_product["surplus_kg"] > 0]
    events = by_product[["date", "product"]].copy()
    events["qty_kg"] = (
        by_product["surplus_kg"] * by_product["demand_kg"] / by_product["demand_kg_day"]
    )
    events["destination"] = rng.choice(
        SURPLUS_DESTINATIONS, size=len(events), p=SURPLUS_DESTINATION_P
    )
    return events.reset_index(drop=True)


def generate(cfg: SyntheticConfig) -> SyntheticDataset:
    """Genera el dataset completo de forma determinista según cfg.seed."""
    rng = np.random.default_rng(cfg.seed)
    dates = pd.date_range(cfg.start, cfg.end, freq="D")
    events = cal.special_days(cfg.start, cfg.end)

    demand = _series_index(dates)
    demand["expected_kg"] = _expected_demand(demand, cfg, events)
    noise = rng.lognormal(-(cfg.noise_sigma**2) / 2, cfg.noise_sigma, len(demand))
    demand["demand_kg"] = demand["expected_kg"] * noise

    saca = _plan_saca(demand, cfg, rng)

    orders = _split_customers(demand, cfg, rng)
    orders = orders.merge(saca[["date", "cut_pct"]], on="date")
    orders["delivered_kg"] = orders["ordered_kg"] * (1 - orders["cut_pct"])

    proj = demand[["date", "channel", "product"]].copy()
    bias = proj["channel"].map(PROJECTION_BIAS).to_numpy()
    proj["qty_kg"] = demand["demand_kg"].to_numpy() * rng.lognormal(
        bias - cfg.projection_sigma**2 / 2, cfg.projection_sigma, len(proj)
    )
    proj["source"] = proj["channel"].map(PROJECTION_SOURCE)

    surplus = _surplus_events(demand, saca, rng)

    for df, cols in [
        (orders, ["ordered_kg", "delivered_kg"]),
        (proj, ["qty_kg"]),
        (saca, ["planned_kg", "actual_kg", "demand_kg", "surplus_kg"]),
        (surplus, ["qty_kg"]),
    ]:
        df[cols] = df[cols].round(1)
    orders["cut_pct"] = orders["cut_pct"].round(4)
    saca["cut_pct"] = saca["cut_pct"].round(4)

    orders = orders[
        ["date", "channel", "customer", "product", "ordered_kg", "delivered_kg", "cut_pct"]
    ].sort_values(["date", "channel", "customer", "product"], ignore_index=True)
    saca = saca[
        ["date", "planned_birds", "planned_kg", "actual_kg", "demand_kg", "cut_pct", "surplus_kg"]
    ]

    summary = {
        "days": len(dates),
        "series": int(demand.groupby(["channel", "product"]).ngroups),
        "order_rows": len(orders),
        "avg_daily_demand_kg": round(float(saca["demand_kg"].mean()), 1),
        "cut_days_pct": round(float((saca["cut_pct"] > 0).mean() * 100), 1),
        "avg_cut_on_cut_days_pct": round(
            float(saca.loc[saca["cut_pct"] > 0, "cut_pct"].mean() * 100), 1
        ),
        "surplus_days_pct": round(float((saca["surplus_kg"] > 0).mean() * 100), 1),
        "discarded_kg": round(
            float(surplus.loc[surplus["destination"] == "discard", "qty_kg"].sum()), 1
        ),
    }
    return SyntheticDataset(orders, proj, saca, surplus, cfg, summary)


def write_dataset(ds: SyntheticDataset, out_dir: Path) -> list[Path]:
    """Escribe los CSV y un metadata.json con los parámetros usados."""
    out_dir.mkdir(parents=True, exist_ok=True)
    files = {
        "orders.csv": ds.orders,
        "projections.csv": ds.projections,
        "saca.csv": ds.saca,
        "surplus_events.csv": ds.surplus_events,
    }
    written = []
    for name, df in files.items():
        path = out_dir / name
        df.to_csv(path, index=False, date_format="%Y-%m-%d")
        written.append(path)
    meta = {"config": asdict(ds.config) | {"start": ds.config.start}, "summary": ds.summary}
    meta_path = out_dir / "metadata.json"
    meta_path.write_text(
        json.dumps(meta, default=str, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    written.append(meta_path)
    return written
