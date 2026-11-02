"""Días especiales de Perú: feriados oficiales (librería `holidays`) más las fechas pico."""

from datetime import date

import holidays
import pandas as pd

from app.shared.domain.calendar import HOLIDAY, peak_days


def special_days(start: date, end: date) -> pd.DataFrame:
    """Días especiales entre start y end (inclusive), uno por fila: date, event, name.

    Un mismo día puede tener varios eventos (p. ej. 28 de julio: feriado y fiestas patrias).
    """
    years = range(start.year, end.year + 1)
    rows: list[tuple[date, str, str]] = []

    for day, name in holidays.country_holidays("PE", years=years).items():
        rows.append((day, HOLIDAY, name))

    for year in years:
        rows += peak_days(year)

    df = pd.DataFrame(rows, columns=["date", "event", "name"])
    df["date"] = pd.to_datetime(df["date"])
    in_range = df["date"].between(pd.Timestamp(start), pd.Timestamp(end))
    return df[in_range].drop_duplicates(["date", "event"]).sort_values("date", ignore_index=True)
