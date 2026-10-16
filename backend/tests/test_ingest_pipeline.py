import pandas as pd

from app.ingest.pipeline import channel_from_filename, parse
from app.ingest.reader import read_file


def _parse(path, schema, catalog, confirmed=None, table=None):
    raw = read_file(path.read_bytes(), path.name, schema.known_names())
    return raw, parse(raw, path.name, schema, catalog, confirmed, table)


def test_standard_template_loads(sample, schema, catalog) -> None:
    _, out = _parse(sample("Horeca_comercial1"), schema, catalog)
    assert out.status == "ok"
    orders = out.tables["orders"]
    assert out.rows_ok == len(orders) == 60
    assert set(orders["channel"]) == {"Horeca"}
    assert orders["qty_kg"].gt(0).all()


def test_aliases_are_resolved(sample, schema, catalog) -> None:
    _, out = _parse(sample("Supermercados_comercial2"), schema, catalog)
    assert out.status == "ok"
    assert out.mapping == {
        "fecha_pedido": "date",
        "canal": "channel",
        "tienda": "customer",
        "item": "product",
        "kilos": "qty_kg",
        "tipo": "type",
    }


def test_header_detection_skips_title_rows(sample, schema, catalog) -> None:
    raw, out = _parse(sample("Tiendas"), schema, catalog)
    assert raw.header_row == 2
    assert raw.source_columns == ["Semana", "Total Kg"]
    assert out.status == "needs_mapping"
    assert out.missing_fields == ["date", "qty_kg"]


def test_unknown_columns_need_mapping(sample, schema, catalog) -> None:
    _, out = _parse(sample("Horeca_horeca-wsp"), schema, catalog)
    assert out.status == "needs_mapping"
    assert out.missing_fields == ["qty_kg"]
    assert out.mapping == {"dia": "date", "local": "customer"}


def test_confirmed_mapping_with_constants_routes_to_projections(sample, schema, catalog) -> None:
    confirmed = {
        "descripcion": "product",
        "peso_neto_kg": "qty_kg",
        "observaciones": "",
        "=type": "proyeccion",
        "=source": "message",
    }
    _, out = _parse(sample("Horeca_horeca-wsp"), schema, catalog, confirmed)
    assert out.status == "ok"
    assert list(out.tables) == ["projections"]
    proj = out.tables["projections"]
    assert set(proj["source"]) == {"message"}
    assert set(proj["channel"]) == {"Horeca"}  # tomado del nombre del archivo
    assert set(proj["product"]) <= set(catalog.products)  # "POLLO BRASA" → "Pollo brasa"
    assert proj["qty_kg"].gt(0).all()  # "1.234,5" → 1234.5


def test_invalid_rows_are_reported(sample, schema, catalog) -> None:
    _, out = _parse(sample("Supermercados_comercial3"), schema, catalog)
    assert out.status == "partial"
    assert len(out.errors) == 6
    messages = " | ".join(e.message for e in out.errors)
    for fragment in ["≥ 0", "falta fecha", "'Pavo'", "'Supermercado'", "'n/a'", "tipo no válido"]:
        assert fragment in messages
    assert all(e.row >= 2 for e in out.errors)  # número de fila como en Excel


def test_duplicate_keys_are_summed(schema, catalog) -> None:
    csv = (
        b"fecha,canal,cliente,producto,cantidad_kg\n"
        b"2026-10-01,Horeca,HOR-01,Pechuga,10\n"
        b"2026-10-01,Horeca,HOR-01,Pechuga,5\n"
    )
    raw = read_file(csv, "x.csv", schema.known_names())
    out = parse(raw, "x.csv", schema, catalog)
    assert out.status == "ok"
    orders = out.tables["orders"]
    assert len(orders) == 1
    assert orders.iloc[0]["qty_kg"] == 15.0
    assert orders.iloc[0]["customer"] == "HOR-01"


def test_missing_product_defaults_to_total(schema, catalog) -> None:
    csv = b"fecha;kilos\n2026-10-01;100\n2026-10-02;120\n"
    raw = read_file(csv, "Tiendas_x_20261002.csv", schema.known_names())
    out = parse(raw, "Tiendas_x_20261002.csv", schema, catalog)
    assert out.status == "ok"
    orders = out.tables["orders"]
    assert set(orders["product"]) == {"TOTAL"}
    assert set(orders["channel"]) == {"Tiendas"}
    assert orders["date"].tolist() == [
        pd.Timestamp("2026-10-01").date(),
        pd.Timestamp("2026-10-02").date(),
    ]


def test_channel_from_filename(catalog) -> None:
    assert channel_from_filename("supermercados_ana_20261015.xlsx", catalog) == "Supermercados"
    assert channel_from_filename("reporte.xlsx", catalog) is None
