"""Escribe una `ExportTable` en los mismos formatos que la web: Excel, PDF y CSV.

El contenido (título, subtítulo, columnas y filas) sale del caso de uso; aquí solo se le da
formato, imitando la exportación de la web (encabezado azul, filas alternadas, horizontal).
"""

import csv
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from io import BytesIO, StringIO
from typing import Literal

from fpdf import FPDF
from fpdf.fonts import FontFace
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.planning.application.export import Cell, ExportTable

ExportFormat = Literal["xlsx", "pdf", "csv"]
BRAND = (11, 44, 97)  # #0B2C61, el mismo azul del encabezado en la web
BRAND_HEX = "0B2C61"
STRIPE = (240, 245, 252)


def _text(value: Cell) -> str:
    if value is None:
        return ""
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def to_xlsx(table: ExportTable) -> bytes:
    """Título, subtítulo, encabezado fijo con filtros y anchos de columna."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Proyecciones"
    ws.append([table.title])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([table.subtitle])
    ws["A2"].font = Font(italic=True, color="555555")
    ws.append([c.label for c in table.columns])
    header_row = ws.max_row
    for cell in ws[header_row]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=BRAND_HEX)
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    for row in table.rows:
        ws.append(row)
    for i, column in enumerate(table.columns, start=1):
        ws.column_dimensions[get_column_letter(i)].width = column.width + 2
    for (cell,) in ws.iter_rows(min_row=header_row + 1, min_col=1, max_col=1):
        cell.number_format = "yyyy-mm-dd"
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    last = get_column_letter(len(table.columns))
    ws.auto_filter.ref = f"A{header_row}:{last}{max(ws.max_row, header_row)}"
    out = BytesIO()
    wb.save(out)
    return out.getvalue()


def to_csv(table: ExportTable) -> bytes:
    """Como la web: BOM (Excel reconoce las tildes) y comillas en todos los campos."""
    out = StringIO()
    writer = csv.writer(out, quoting=csv.QUOTE_ALL, lineterminator="\n")
    writer.writerow([c.label for c in table.columns])
    writer.writerows([_text(v) for v in row] for row in table.rows)
    return ("﻿" + out.getvalue()).encode("utf-8")


def to_pdf(table: ExportTable) -> bytes:
    """A4 horizontal con título, subtítulo y tabla (como la web, con jsPDF)."""
    pdf = FPDF(orientation="L", unit="pt", format="A4")
    pdf.set_margins(40, 40, 40)
    pdf.set_auto_page_break(auto=True, margin=36)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 20, table.title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100)
    pdf.cell(0, 16, table.subtitle, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_text_color(0)
    pdf.set_font("Helvetica", "", 7.5)
    widths = [c.width for c in table.columns]
    align = ["RIGHT" if c.numeric else "LEFT" for c in table.columns]
    with pdf.table(
        col_widths=widths,
        text_align=align,
        headings_style=FontFace(emphasis="BOLD", color=255, fill_color=BRAND),
        cell_fill_color=STRIPE,
        cell_fill_mode="ROWS",
        line_height=11,
        padding=2,
        repeat_headings=1,
    ) as grid:
        grid.row([c.label for c in table.columns])
        for row in table.rows:
            grid.row([_text(v) for v in row])
    return bytes(pdf.output())


@dataclass(frozen=True)
class Writer:
    media_type: str
    write: Callable[[ExportTable], bytes]


WRITERS: dict[str, Writer] = {
    "xlsx": Writer("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", to_xlsx),
    "pdf": Writer("application/pdf", to_pdf),
    "csv": Writer("text/csv; charset=utf-8", to_csv),
}
