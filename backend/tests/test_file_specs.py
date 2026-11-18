"""Validación de los archivos que se cargan (config/imports.yaml)."""

from datetime import date, datetime, timedelta

import pytest

from app.planning.domain.file_specs import ColumnSpec, FileSpec, RowError, header_key
from app.planning.infrastructure.file_specs import file_specs
from app.planning.infrastructure.persistence.tables import dispatch_orders, store_sales
from app.shared.domain.errors import DomainError
from app.shared.infrastructure.database.metadata import TABLES
from tests.test_aris_import import HEADER, TODAY, _csv, _line, _login, _upload, client  # noqa: F401


def test_cells_are_read_like_the_business_writes_them() -> None:
    day = ColumnSpec("Fecha", "date")
    assert day.parse("2026-11-19") == date(2026, 11, 19)
    assert day.parse("2026-07-01 00:00:00") == date(2026, 7, 1)
    assert day.parse("19/11/2026") == date(2026, 11, 19)
    assert day.parse(datetime(2026, 11, 19, 8)) == date(2026, 11, 19)
    with pytest.raises(RowError, match="no es una fecha: mañana"):
        day.parse("mañana")
    kilos = ColumnSpec("Kilos", "float", default=0)
    assert kilos.parse("1,5") == 1.5
    assert kilos.parse("1,250.5") == 1250.5
    assert kilos.parse("#VALUE!") == 0  # error de fórmula de Excel = celda vacía
    assert kilos.parse("") == 0
    order = ColumnSpec("COD. PEDIDO", "int")
    assert order.parse("00037229 ") == 37229
    assert order.parse(4512968771.0) == 4512968771
    with pytest.raises(RowError, match="entero"):
        order.parse("12.5")
    code = ColumnSpec("Codigo")
    assert code.parse(100.0) == "100"
    assert ColumnSpec("Zona", nullable=True).parse("NULL") is None


def test_titles_match_without_accents_case_or_signs() -> None:
    assert header_key("COD. PEDIDO") == header_key("cod pedido") == "codpedido"
    assert header_key("Producción") == "produccion"
    spec = FileSpec(
        key="x",
        label="archivo X",
        used_by=(),
        columns={
            "day": ColumnSpec("FECHA", "date"),
            "units": ColumnSpec("CANTIDAD", "float", aliases=("Unidades",)),
            "note": ColumnSpec("NOTA", required=False, nullable=True),
        },
        detect=("day",),
    )
    assert spec.locate(["fecha", "UNIDADES"]) == {"day": 0, "units": 1}
    assert spec.locate(["otra", "cosa"]) is None  # no es este archivo
    with pytest.raises(DomainError, match="le falta: CANTIDAD"):
        spec.locate(["Fecha"])


def test_yaml_matches_the_tables() -> None:
    """Los campos de cada export son las columnas de su tabla (si cambia una, se nota aquí)."""
    specs = file_specs()
    for key, table in (("despacho", dispatch_orders), ("ventas", store_sales)):
        assert set(specs[key].columns) == {c.name for c in table.c} - {"id"}
        assert TABLES[specs[key].table or ""] == table.name
    assert {s.key for s in specs.values() if s.upload == "aris"} == {"despacho", "ventas"}
    assert all(s.used_by for s in specs.values())


def test_upload_says_which_column_is_missing(client) -> None:  # noqa: F811
    _login(client, "supervisor")
    header = HEADER.replace(",Vendedor", "")
    line = _line(TODAY - timedelta(days=1), 4).rsplit(",", 1)[0]
    r = _upload(client, f"{header}\n{line}\n".encode(), "despacho.csv")
    assert r.status_code == 422
    assert "le falta: Vendedor" in r.json()["detail"]


def test_upload_reports_the_rows_it_could_not_use(client) -> None:  # noqa: F811
    _login(client, "supervisor")
    day = TODAY - timedelta(days=1)
    bad = _line(day, 4, order=2).replace(day.isoformat(), "ayer")
    r = _upload(client, _csv(_line(day, 4), bad), "despacho.csv")
    assert r.status_code == 200, r.text
    load = r.json()[0]
    assert load["rows"] == 1 and load["skipped"] == 1
    assert load["issues"] == ["Fila 3: «FechaRegistro» no es una fecha: ayer"]
