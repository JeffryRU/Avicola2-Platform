from datetime import date, datetime
from uuid import uuid4

import pytest

from app.planning.application.use_cases import DayUnits, SubmitProjection
from app.planning.domain.catalog import Catalog
from app.planning.domain.models import Product, Seller
from app.shared.domain.errors import DomainError

PRODUCTS = [Product("B1", "BRASA", "Brasa 1", 1.2, 0), Product("B2", "BRASA", "Brasa 2", 1.5, 1)]
SELLER = Seller("jperez", "Juan Pérez", "Zona Norte")


class _Products:
    def list_active(self):
        return PRODUCTS


class _Projections:
    def __init__(self):
        self.saved = []

    def find(self, *_):
        return []

    def replace(self, items):
        self.saved.extend(items)


class _Clock:
    def today(self):
        return date(2026, 11, 2)

    def now(self):
        return datetime(2026, 11, 2, 9, 0)


def test_lines_compute_kg_from_catalog() -> None:
    lines = Catalog(PRODUCTS).lines_for("BRASA", {"B1": 10})
    assert [(ln.product_id, ln.units, ln.kg) for ln in lines] == [("B1", 10, 12.0), ("B2", 0, 0.0)]


@pytest.mark.parametrize(
    ("category", "units"),
    [("POLLO", {"B1": 1}), ("BRASA", {"R1": 1}), ("BRASA", {"B1": -1}), ("BRASA", {"B1": 100000})],
)
def test_invalid_lines(category, units) -> None:
    with pytest.raises(DomainError):
        Catalog(PRODUCTS).lines_for(category, units)


def _submit(days, max_days=7):
    repo = _Projections()
    SubmitProjection(_Products(), repo, _Clock(), max_days)(SELLER, "BRASA", days, uuid4())
    return repo.saved


def test_submit_sets_totals_and_one_submission() -> None:
    saved = _submit(
        [DayUnits(date(2026, 11, 3), {"B2": 2}), DayUnits(date(2026, 11, 2), {"B1": 1})]
    )
    assert [p.date.day for p in saved] == [2, 3]
    assert len({p.submission_id for p in saved}) == 1
    assert (saved[1].total_units, saved[1].total_kg) == (2, 3.0)


@pytest.mark.parametrize(
    "days",
    [
        [DayUnits(date(2026, 11, 1), {"B1": 1})],  # pasado
        [DayUnits(date(2026, 11, 3), {})],  # sin unidades
        [DayUnits(date(2026, 11, 3), {"B1": 1})] * 2,  # fechas repetidas
        [DayUnits(date(2026, 11, 3 + i), {"B1": 1}) for i in range(3)],  # más del máximo
    ],
)
def test_submit_rejects(days) -> None:
    with pytest.raises(DomainError):
        _submit(days, max_days=2)
