"""Carga de la historia del negocio (CSV de despacho y de ventas, Excel de producción)."""

import csv
from datetime import date, datetime

import pytest
from openpyxl import Workbook
from sqlalchemy import func, select

from app.core.config import get_settings
from app.planning.infrastructure import cli
from app.planning.infrastructure.persistence.tables import (
    dispatch_orders,
    production,
    store_sales,
)
from app.shared.infrastructure.database.metadata import metadata
from app.shared.infrastructure.database.session import SessionLocal, engine

ORDER_COLUMNS = [
    "PedidoCliente",
    "NumeroPedido",
    "PedidoDetalleMaterialCodigo",
    "PedidoDetalleMaterial",
    "PedidoDetalleKilos",
    "PesoDespachado",
    "PedidoDetalleCantidad",
    "CantidadDespachada",
    "PedidoZona",
    "FechaRegistro",
    "FechaEntrega",
    "Vendedor",
]
SALE_COLUMNS = [
    "PedidoOdooDetalleID",
    "CodigoDocumentoEmitido",
    "TipoDocumentoEmitidoDescripcion",
    "TipoAgrupacion",
    "FechaPedido",
    "RazonSocialCliente",
    "TiendaCodigo",
    "Tienda",
    "MaterialCodigoSAP",
    "MaterialDescripcion",
    "Cantidad",
    "UnidadMedidaCodigo_DET",
    "PrecioUnitario",
]


def _csv(path, columns, rows) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(columns)
        writer.writerows(rows)


def _orders(folder, rows) -> None:
    _csv(folder / "DESPACHO.csv", ORDER_COLUMNS, rows)


def _sales(folder, rows) -> None:
    _csv(folder / "ventas_2026.CSV", SALE_COLUMNS, rows)


def _production(folder) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "DB_CALIDA_B"
    sheet.append(["FECHA", "RANGO", "PEDIDO", "PRODUCCION", "CALIDAD B"])
    sheet.append([datetime(2026, 3, 2), "B0", 100, 90, 4])
    sheet.append([datetime(2026, 3, 2), "B1", 0, 30, 0])
    workbook.save(folder / "produccion.xlsx")


@pytest.fixture
def session():
    metadata.drop_all(engine)
    metadata.create_all(engine)
    with SessionLocal() as s:
        yield s
    metadata.drop_all(engine)


def _count(session, table) -> int:
    return session.scalar(select(func.count()).select_from(table))


ORDER = ["Cliente Uno", "10", "PT-1", "POLLO BRASA", "40", "38.5", "20", "19", "TRUJILLO"]


def test_loads_everything_found_in_the_folder(session, tmp_path, capsys) -> None:
    _orders(
        tmp_path,
        [
            [*ORDER, "2026-03-01", "2026-03-02", "Vendedor"],
            # Sin código de material, zona ni vendedor: en el export vienen vacíos.
            [
                "Cliente Dos",
                "11",
                "",
                "MENUDENCIA",
                "5",
                "0",
                "0",
                "0",
                "",
                "2026-03-01",
                "2026-03-02",
                "",
            ],
        ],
    )
    sale = ["F001-1", "FACTURA", "FACTURA", "2026-03-02", "Persona", "220402", "Tienda 1"]
    _sales(
        tmp_path,
        [
            ["7", *sale, "M-1", "PB BRASA", "20.6", "KGS", "11.49"],
            # El export repite la línea: se carga una vez.
            ["7", *sale, "M-1", "PB BRASA", "20.6", "KGS", "11.49"],
            ["8", *sale, "M-2", "HUEVO PARDO", "720", "UND", "0.36"],
        ],
    )
    _production(tmp_path)

    assert cli.load_history(session, get_settings(), tmp_path) == 0

    orders = (
        session.execute(select(dispatch_orders).order_by(dispatch_orders.c.id)).mappings().all()
    )
    assert len(orders) == 2
    assert orders[0]["dispatched_kg"] == 38.5
    assert orders[0]["delivery_date"] == date(2026, 3, 2)
    assert (orders[1]["material_code"], orders[1]["zone"], orders[1]["seller"]) == (None,) * 3
    sales = session.execute(select(store_sales).order_by(store_sales.c.id)).mappings().all()
    assert [s["source_line_id"] for s in sales] == [7, 8]
    assert sales[1]["quantity"] == 720
    assert "customer" not in sales[0]
    assert _count(session, production) == 2
    assert "2 líneas de ventas en tienda" in capsys.readouterr().out


def test_loading_again_replaces_what_was_there(session, tmp_path) -> None:
    _orders(tmp_path, [[*ORDER, "2026-03-01", "2026-03-02", "Vendedor"]] * 3)
    cli.load_history(session, get_settings(), tmp_path)
    _orders(tmp_path, [[*ORDER, "2026-03-01", "2026-03-02", "Vendedor"]])

    assert cli.load_history(session, get_settings(), tmp_path) == 0

    assert _count(session, dispatch_orders) == 1


def test_unreadable_rows_are_skipped_and_counted(session, tmp_path, capsys) -> None:
    _orders(
        tmp_path,
        [
            [*ORDER, "2026-03-01", "2026-03-02", "Vendedor"],
            [*ORDER, "2026-03-01", "no es fecha", "Vendedor"],
        ],
    )

    assert cli.load_history(session, get_settings(), tmp_path) == 0

    assert _count(session, dispatch_orders) == 1
    assert "1 filas descartadas" in capsys.readouterr().out


def test_fails_when_there_is_nothing_to_load(session, tmp_path) -> None:
    assert cli.load_history(session, get_settings(), tmp_path) == 1
    assert cli.load_history(session, get_settings(), tmp_path / "no-existe") == 1
