from datetime import date

import pandas as pd
import pytest

from app.core.catalog import get_catalog
from app.synthetic.generator import BASE_KG, SyntheticConfig, generate

END = date(2026, 10, 14)


@pytest.fixture(scope="module")
def ds():
    return generate(SyntheticConfig(end=END, days=365))


def test_shape_and_catalog(ds) -> None:
    catalog = get_catalog()
    assert ds.orders["date"].min() == pd.Timestamp(ds.config.start)
    assert ds.orders["date"].max() == pd.Timestamp(END)
    assert set(ds.orders["channel"]) == set(catalog.channels)
    assert set(ds.orders["product"]) <= set(catalog.products)
    assert 4 <= ds.orders["product"].nunique() <= 6
    assert len(ds.saca) == 365


def test_quantities_are_valid(ds) -> None:
    assert (ds.orders["ordered_kg"] >= 0).all()
    assert (ds.orders["delivered_kg"] <= ds.orders["ordered_kg"] + 0.1).all()
    assert ds.saca["cut_pct"].between(0, 1).all()
    # Un día no puede tener recorte y excedente a la vez.
    assert not ((ds.saca["cut_pct"] > 0) & (ds.saca["surplus_kg"] > 0)).any()


def test_censored_demand_on_cut_days(ds) -> None:
    cut = ds.orders[ds.orders["cut_pct"] > 0]
    assert not cut.empty
    assert (cut["delivered_kg"] < cut["ordered_kg"]).mean() > 0.9


def test_weekly_seasonality_horeca(ds) -> None:
    horeca = ds.orders[ds.orders["channel"] == "Horeca"]
    by_dow = horeca.groupby(horeca["date"].dt.dayofweek)["ordered_kg"].sum()
    assert by_dow[6] > by_dow[0] * 1.3  # domingo bastante más que lunes


def test_pollo_a_la_brasa_peak(ds) -> None:
    brasa = ds.orders[(ds.orders["product"] == "Pollo brasa")]
    daily = brasa.groupby("date")["ordered_kg"].sum()
    peak = daily[pd.Timestamp("2026-07-19")]
    usual_sundays = daily[(daily.index.dayofweek == 6) & (daily.index.month == 6)].mean()
    assert peak > usual_sundays * 2


def test_level_close_to_base(ds) -> None:
    expected = sum(sum(p.values()) for p in BASE_KG.values())
    first_month = ds.saca.head(30)["demand_kg"].mean()
    assert first_month == pytest.approx(expected, rel=0.15)


def test_deterministic() -> None:
    a = generate(SyntheticConfig(end=END, days=30, seed=7))
    b = generate(SyntheticConfig(end=END, days=30, seed=7))
    pd.testing.assert_frame_equal(a.orders, b.orders)
    pd.testing.assert_frame_equal(a.saca, b.saca)
