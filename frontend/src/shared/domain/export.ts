export type ExportFormat = 'csv' | 'xlsx' | 'pdf'

export const EXPORT_FORMATS: { format: ExportFormat; label: string; hint: string }[] = [
  { format: 'xlsx', label: 'Excel', hint: '.xlsx, para analizar o filtrar' },
  { format: 'pdf', label: 'PDF', hint: 'Para imprimir o compartir' },
  { format: 'csv', label: 'CSV', hint: 'Texto separado por comas' },
]

export interface ExportColumn {
  label: string
  /** Ancho aproximado en caracteres (Excel y PDF). */
  width: number
  numeric?: boolean
}

/** Tabla lista para escribir en cualquier formato (la misma para CSV, Excel y PDF). */
export interface ExportTable {
  title: string
  subtitle: string
  columns: ExportColumn[]
  rows: (string | number)[][]
}

/** CSV con BOM (Excel reconoce las tildes) y comillas en todos los campos. */
export function tableToCsv(table: ExportTable): string {
  const lines = [table.columns.map((c) => c.label), ...table.rows]
  return `\uFEFF${lines.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')}`
}
