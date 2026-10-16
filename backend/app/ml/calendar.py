"""Calendario peruano: feriados oficiales y fechas pico de consumo de pollo.

Lo usan el generador sintético y, más adelante, las features del forecast.
"""

from datetime import date, timedelta

import holidays
import pandas as pd

# Fechas pico que no son feriado oficial (o que tienen un efecto propio).
MOTHERS_DAY = "dia_de_la_madre"
POLLO_A_LA_BRASA_DAY = "dia_del_pollo_a_la_brasa"
FIESTAS_PATRIAS = "fiestas_patrias"
CHRISTMAS_EVE = "nochebuena"
CHRISTMAS = "navidad"
NEW_YEARS_EVE = "fin_de_anio"
NEW_YEAR = "anio_nuevo"
HOLIDAY = "feriado"


def nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """N-ésimo día de la semana del mes (weekday: lunes=0 … domingo=6)."""
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (n - 1))


def mothers_day(year: int) -> date:
    """Día de la Madre en Perú: segundo domingo de mayo."""
    return nth_weekday(year, 5, 6, 2)


def pollo_a_la_brasa_day(year: int) -> date:
    """Día del Pollo a la Brasa: tercer domingo de julio."""
    return nth_weekday(year, 7, 6, 3)


def special_days(start: date, end: date) -> pd.DataFrame:
    """Días especiales entre start y end (inclusive), uno por fila: date, event, name.

    Un mismo día puede tener varios eventos (p. ej. 28 de julio: feriado y fiestas patrias).
    """
    years = range(start.year, end.year + 1)
    rows: list[tuple[date, str, str]] = []

    for day, name in holidays.country_holidays("PE", years=years).items():
        rows.append((day, HOLIDAY, name))

    for year in years:
        rows += [
            (mothers_day(year), MOTHERS_DAY, "Día de la Madre"),
            (pollo_a_la_brasa_day(year), POLLO_A_LA_BRASA_DAY, "Día del Pollo a la Brasa"),
            (date(year, 7, 28), FIESTAS_PATRIAS, "Fiestas Patrias"),
            (date(year, 7, 29), FIESTAS_PATRIAS, "Fiestas Patrias"),
            (date(year, 12, 24), CHRISTMAS_EVE, "Nochebuena"),
            (date(year, 12, 25), CHRISTMAS, "Navidad"),
            (date(year, 12, 31), NEW_YEARS_EVE, "Fin de año"),
            (date(year, 1, 1), NEW_YEAR, "Año Nuevo"),
        ]

    df = pd.DataFrame(rows, columns=["date", "event", "name"])
    df["date"] = pd.to_datetime(df["date"])
    in_range = df["date"].between(pd.Timestamp(start), pd.Timestamp(end))
    return df[in_range].drop_duplicates(["date", "event"]).sort_values("date", ignore_index=True)
