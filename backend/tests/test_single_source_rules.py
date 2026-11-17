"""Reglas que pasaron a una sola fuente en la auditoría de la tarea 0005 (ADR 0016).

Cada propiedad compara el código con un ORÁCULO escrito a partir de la especificación (la
tarea, los ADR y los mensajes que ya daba la API), sin llamar a la función que se prueba: si la
regla centralizada se equivoca, la prueba no la "confirma" a sí misma.
"""

from datetime import date, time, timedelta

import pytest
from conftest import examples
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from app.ingest.domain.models import IngestStatus, RawTable
from app.ingest.domain.pipeline import parse
from app.ingest.infrastructure.config import get_catalog, get_schema
from app.main import app
from app.planning.application.editing import DECIDED_TITLE
from app.planning.domain.dates import check_range, check_recent_day
from app.planning.domain.editing import DECISIONS, Decision, parse_cutoff
from app.planning.domain.models import Product, projectable
from app.planning.domain.permissions import ROLES, Permission, can, require
from app.planning.domain.production import check_production_date
from app.planning.domain.stock import check_stock_date
from app.planning.infrastructure.http import schemas as s
from app.shared.domain.errors import DomainError, ForbiddenError
from app.shared.infrastructure.http.paths import API_PREFIX, INGEST_PREFIX

EXAMPLES = examples(150)
DAYS = st.dates(min_value=date(2020, 1, 1), max_value=date(2030, 12, 31))


# --- Rango de fechas de una consulta (antes: _check_range en application) -------------------


@settings(max_examples=EXAMPLES)
@given(DAYS, DAYS)
def test_query_range(date_from, date_to):
    # Especificación: invertido → error; más de 800 días entre extremos → error; si no, vale.
    span = date_to.toordinal() - date_from.toordinal()
    if span < 0:
        expected = "El rango de fechas está invertido."
    elif span > 800:
        expected = "El rango no puede superar 800 días."
    else:
        expected = None
    if expected is None:
        check_range(date_from, date_to)
    else:
        with pytest.raises(DomainError) as err:
            check_range(date_from, date_to)
        assert err.value.message == expected


# --- Registro de días pasados: stock y producción (antes, dos copias de la misma regla) ----


def _recent_day_oracle(day: date, today: date, back: int, subject: str) -> str | None:
    if day.toordinal() > today.toordinal():
        return f"No se puede registrar {subject} de un día que aún no llega."
    if today.toordinal() - day.toordinal() > back:
        return f"Solo se puede registrar o corregir {subject} de los últimos {back} días."
    return None


@settings(max_examples=EXAMPLES)
@given(st.integers(-20, 20), DAYS, st.integers(0, 15))
def test_recent_day(offset, today, back):
    day = today + timedelta(days=offset)
    expected = _recent_day_oracle(day, today, back, "algo")
    if expected is None:
        check_recent_day(day, today, back, "algo")
    else:
        with pytest.raises(DomainError) as err:
            check_recent_day(day, today, back, "algo")
        assert err.value.message == expected


@settings(max_examples=EXAMPLES)
@given(st.integers(-20, 20), DAYS)
def test_stock_and_production_keep_their_messages(offset, today):
    # ADR: stock y producción se registran hasta 7 días atrás (hoy incluido), nunca a futuro.
    day = today + timedelta(days=offset)
    for check, subject in (
        (check_stock_date, "el stock"),
        (check_production_date, "la producción"),
    ):
        expected = _recent_day_oracle(day, today, 7, subject)
        if expected is None:
            check(day, today)
        else:
            with pytest.raises(DomainError) as err:
                check(day, today)
            assert err.value.message == expected


# --- Calidad A: lo único que se proyecta y se pide ------------------------------------------

QUALITIES = st.one_of(st.sampled_from(["A", "B"]), st.text(max_size=2))


@settings(max_examples=EXAMPLES)
@given(st.lists(QUALITIES, max_size=12))
def test_only_quality_a_is_projectable(qualities):
    products = [
        Product(f"P{i:04d}", "BRASA", f"P{i}", 1.0, i, None, q) for i, q in enumerate(qualities)
    ]
    expected = [p.id for p, q in zip(products, qualities, strict=True) if q == "A"]
    assert [p.id for p in projectable(products)] == expected
    assert all(p.is_projectable == (p.quality == "A") for p in products)


# --- Mensajes de permiso: uno por permiso, en una tabla -------------------------------------

# Los mensajes que daba la API antes de centralizarlos (copiados de cada caso de uso).
DENIED_BEFORE = {
    Permission.MANAGE_EDITING: "Solo un supervisor puede hacer esto.",
    Permission.MANAGE_ACCOUNTS: "Solo un supervisor puede hacer esto.",
    Permission.CHANGE_ROLES: "Solo el supervisor general puede cambiar roles.",
    Permission.VIEW_STOCK: "No tienes permiso para ver el stock.",
    Permission.MANAGE_STOCK: "No tienes permiso para registrar el stock.",
    Permission.VIEW_SACA: "No tienes permiso para ver el cálculo de saca.",
    Permission.VIEW_PRODUCTION: "No tienes permiso para ver la producción.",
    Permission.MANAGE_PRODUCTION: "No tienes permiso para registrar la producción.",
}


@settings(max_examples=EXAMPLES)
@given(st.one_of(st.sampled_from(ROLES), st.text(max_size=20)), st.sampled_from(list(Permission)))
def test_require_denies_with_the_same_message(role, permission):
    if can(role, permission):
        require(role, permission)
        return
    with pytest.raises(ForbiddenError) as err:
        require(role, permission)
    assert err.value.message == DENIED_BEFORE.get(permission, "No tienes permiso para hacer esto.")


# --- Hora de corte: el dominio y la API aceptan lo mismo ------------------------------------


def _cutoff_oracle(text: str) -> time | None:
    """HH:MM de 00:00 a 23:59, con dos dígitos en cada parte."""
    if len(text) != 5 or text[2] != ":":
        return None
    hh, mm = text[:2], text[3:]
    if not (hh.isascii() and hh.isdigit() and mm.isascii() and mm.isdigit()):
        return None
    hours, minutes = int(hh), int(mm)
    return time(hours, minutes) if hours < 24 and minutes < 60 else None


@settings(max_examples=EXAMPLES)
@given(st.text(alphabet="0123456789: a", max_size=7))
def test_cutoff_domain_and_api_agree(text):
    expected = _cutoff_oracle(text)
    if expected is None:
        with pytest.raises(DomainError):
            parse_cutoff(text)
        with pytest.raises(ValidationError):
            s.CutoffIn(cutoff_time=text, days_before=0)
    else:
        assert parse_cutoff(text) == expected
        assert s.CutoffIn(cutoff_time=text, days_before=0).cutoff_time == text


def test_decisions_are_one_list():
    assert set(Decision.__args__) == set(DECISIONS) == set(DECIDED_TITLE)


# --- Estado de una carga de la ingesta ------------------------------------------------------


def _status_oracle(rows_ok: int, errors: int) -> str:
    # Especificación (docs/architecture.md): ninguna fila cargada → failed; algunas filas con
    # error → partial; todo bien → ok.
    if rows_ok == 0:
        return "failed"
    return "partial" if errors else "ok"


@given(st.integers(0, 1000), st.integers(0, 1000))
def test_ingest_status_of_rows(rows_ok, errors):
    assert IngestStatus.of_rows(rows_ok, errors) == _status_oracle(rows_ok, errors)


ROW_KINDS = st.sampled_from(["ok", "negative", "bad_date", "bad_channel", "blank"])


@settings(max_examples=examples(60), deadline=None)
@given(st.lists(st.tuples(ROW_KINDS, st.integers(0, 50)), max_size=25))
def test_parse_counts_rows_and_sets_the_status(rows):
    """parse() (dividido en partes en esta auditoría) cuenta y clasifica como antes."""
    schema, catalog = get_schema(), get_catalog()
    product = catalog.products[0]
    columns = ["fecha", "canal", "producto", "kilos"]
    records = []
    for i, (kind, kg) in enumerate(rows):
        record = {
            "fecha": "xx/13/2026" if kind == "bad_date" else f"2026-10-{1 + i % 28:02d}",
            "canal": "Marte" if kind == "bad_channel" else "Horeca",
            "producto": product,
            "kilos": -1 - kg if kind == "negative" else kg,
        }
        records.append(dict.fromkeys(columns) if kind == "blank" else record)
    raw = RawTable(columns, columns, records, None, 0)
    out = parse(raw, "carga.xlsx", schema, catalog)

    filled = [kind for kind, _ in rows if kind != "blank"]
    good = filled.count("ok")
    assert out.rows_total == len(filled)
    assert out.rows_ok == good
    assert len({e.row for e in out.errors}) == len(filled) - good
    assert out.status == _status_oracle(good, len(filled) - good)
    if good:
        assert sum(r["qty_kg"] for r in out.tables["orders"]) == sum(
            kg for kind, kg in rows if kind == "ok"
        )


# --- Rutas y límites: la API usa las constantes del dominio --------------------------------


def test_every_route_uses_a_known_prefix():
    paths = list(app.openapi()["paths"])
    assert paths
    for path in paths:
        assert path.startswith((f"{API_PREFIX}/", f"{INGEST_PREFIX}/", "/health")), path
