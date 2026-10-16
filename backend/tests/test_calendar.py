from datetime import date

from app.ml import calendar as cal


def test_mothers_day_is_second_sunday_of_may() -> None:
    assert cal.mothers_day(2025) == date(2025, 5, 11)
    assert cal.mothers_day(2026) == date(2026, 5, 10)


def test_pollo_a_la_brasa_is_third_sunday_of_july() -> None:
    assert cal.pollo_a_la_brasa_day(2025) == date(2025, 7, 20)
    assert cal.pollo_a_la_brasa_day(2026) == date(2026, 7, 19)


def test_special_days_include_peru_holidays_and_peaks() -> None:
    days = cal.special_days(date(2026, 7, 1), date(2026, 7, 31))
    events = set(zip(days["date"].dt.date, days["event"], strict=True))
    assert (date(2026, 7, 28), cal.HOLIDAY) in events
    assert (date(2026, 7, 28), cal.FIESTAS_PATRIAS) in events
    assert (date(2026, 7, 19), cal.POLLO_A_LA_BRASA_DAY) in events
    assert days["date"].between("2026-07-01", "2026-07-31").all()
