import type { TableExporter } from '@/modules/planning/application/ports'
import { tableToCsv, type ExportFormat, type ExportTable } from '@/modules/planning/domain/export'

const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

function download(blob: Blob, fileName: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Excel con encabezado en negrita y anchos de columna (la librería se carga solo al usarla). */
async function toXlsx(table: ExportTable): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const header = table.columns.map((c) => ({ value: c.label, fontWeight: 'bold' as const }))
  const body = table.rows.map((row) =>
    row.map((value, i) =>
      table.columns[i].numeric ? { value: Number(value), type: Number } : { value: String(value) },
    ),
  )
  return writeExcelFile([header, ...body], {
    columns: table.columns.map((c) => ({ width: c.width + 2 })),
    sheet: 'Proyecciones',
  }).toBlob()
}

/** PDF horizontal con título, subtítulo y tabla (librerías cargadas solo al usarlas). */
async function toPdf(table: ExportTable): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
  doc.setFontSize(16)
  doc.text(table.title, 40, 44)
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(table.subtitle, 40, 62)
  autoTable(doc, {
    startY: 78,
    head: [table.columns.map((c) => c.label)],
    body: table.rows.map((r) => r.map(String)),
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: [11, 44, 97], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 245, 252] },
    columnStyles: Object.fromEntries(
      table.columns.flatMap((c, i) => (c.numeric ? [[i, { halign: 'right' as const }]] : [])),
    ),
    margin: { left: 40, right: 40 },
  })
  return doc.output('blob')
}

/** Escribe la tabla en el formato pedido y la descarga desde el navegador. */
export class BrowserTableExporter implements TableExporter {
  async export(table: ExportTable, format: ExportFormat, fileBase: string) {
    const blob =
      format === 'csv'
        ? new Blob([tableToCsv(table)], { type: MIME.csv })
        : format === 'xlsx'
          ? await toXlsx(table)
          : await toPdf(table)
    download(blob, `${fileBase}.${format}`)
  }
}
