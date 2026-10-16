from datetime import date, datetime

import pytest

from app.ingest.normalize import (
    CellError,
    normalize_header,
    normalize_key,
    parse_date,
    parse_number,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Peso neto (kg)", "peso_neto_kg"),
        ("Fecha Pedido", "fecha_pedido"),
        ("Día", "dia"),
        ("  Descripción ", "descripcion"),
        ("cantidad_kg", "cantidad_kg"),
    ],
)
def test_normalize_header(raw: str, expected: str) -> None:
    assert normalize_header(raw) == expected


def test_normalize_key_ignores_case_accents_and_spaces() -> None:
    assert normalize_key("  POLLO   Brasa ") == normalize_key("pollo brasa")
    assert normalize_key("Proyección") == "proyeccion"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (datetime(2026, 10, 14, 0, 0), date(2026, 10, 14)),
        ("2026-10-14", date(2026, 10, 14)),
        ("14/10/2026", date(2026, 10, 14)),
        ("2026-10-14 00:00:00", date(2026, 10, 14)),
        (46309, date(2026, 10, 14)),  # serial de Excel
    ],
)
def test_parse_date(raw, expected: date) -> None:
    assert parse_date(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (12.5, 12.5),
        (80, 80.0),
        ("1.234,5", 1234.5),
        ("1,234.5", 1234.5),
        ("12,5", 12.5),
        (" 80 ", 80.0),
    ],
)
def test_parse_number(raw, expected: float) -> None:
    assert parse_number(raw) == expected


@pytest.mark.parametrize("raw", ["n/a", "abc", True, "", "13/10/2026"])
def test_parse_number_rejects(raw) -> None:
    with pytest.raises(CellError):
        parse_number(raw)


def test_parse_date_rejects() -> None:
    with pytest.raises(CellError):
        parse_date("mañana")
