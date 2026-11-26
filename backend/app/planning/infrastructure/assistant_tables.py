"""Excel de una tabla del asistente (ADR 0024), con openpyxl."""

import re
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

from app.planning.domain.assistant_tables import cell_value

_INVALID_SHEET = re.compile(r"[\/*?:\[\]]")
MAX_WIDTH = 60


class XlsxTableExporter:
    def xlsx(self, title: str | None, columns: list[str], rows: list[list[str]]) -> bytes:
        """Título en la primera fila, encabezados en negrita, números como números y columnas
        con ancho automático."""
        book = Workbook()
        sheet = book.active
        sheet.title = (_INVALID_SHEET.sub(" ", title or "Tabla").strip() or "Tabla")[:31]
        bold = Font(bold=True)
        first = 1
        if title:
            sheet.cell(row=1, column=1, value=title).font = Font(bold=True, size=13)
            first = 3
        for col, name in enumerate(columns, 1):
            sheet.cell(row=first, column=col, value=name).font = bold
        for r, row in enumerate(rows, first + 1):
            for col, cell in enumerate(row, 1):
                target = sheet.cell(row=r, column=col, value=cell_value(cell))
                if isinstance(target.value, str) and target.value.startswith("="):
                    target.data_type = "s"  # texto del agente: nunca una fórmula
        for col, name in enumerate(columns, 1):
            longest = max([len(name), *(len(row[col - 1]) for row in rows if col <= len(row))])
            sheet.column_dimensions[get_column_letter(col)].width = min(longest + 2, MAX_WIDTH)
        out = BytesIO()
        book.save(out)
        return out.getvalue()
