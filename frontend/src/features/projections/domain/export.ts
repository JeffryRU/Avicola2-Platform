import { dDow } from '@/shared/domain/dates'
import type { MyDay } from '@/features/projections/domain/aggregation'
import type { Catalog } from '@/features/catalog/domain/catalog'
import type { ExportColumn, ExportTable } from '@/shared/domain/export'

const COLUMNS: ExportColumn[] = [
  { label: 'Fecha', width: 11 },
  { label: 'Día', width: 5 },
  { label: 'Categoría', width: 11 },
  { label: 'Código', width: 7 },
  { label: 'Producto', width: 14 },
  { label: 'Kg por unidad', width: 9, numeric: true },
  { label: 'Unidades', width: 9, numeric: true },
  { label: 'Kg', width: 9, numeric: true },
  { label: 'Estado', width: 15 },
  { label: 'Enviado', width: 17 },
]

const SYNC_LABEL: Record<MyDay['sync'], string> = { ok: 'Sincronizada', pending: 'Por sincronizar' }

const round2 = (n: number) => Math.round(n * 100) / 100

/** Proyecciones propias: una fila por día y producto, ordenadas por fecha. */
export function projectionsTable(days: MyDay[], catalog: Catalog, seller: string, generatedAt: Date): ExportTable {
  const rows: (string | number)[][] = []
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const p of catalog.of(d.category)) {
      const units = d.units[p.id] ?? 0
      rows.push([
        d.date,
        dDow(d.date),
        d.category,
        p.id,
        p.name,
        p.kg_per_unit,
        units,
        round2(units * p.kg_per_unit),
        SYNC_LABEL[d.sync],
        d.submittedAt ? d.submittedAt.slice(0, 16).replace('T', ' ') : '',
      ])
    }
  }
  return {
    title: 'Proyecciones de demanda',
    subtitle: `${seller} · generado el ${generatedAt.toLocaleString('es-PE')}`,
    columns: COLUMNS,
    rows,
  }
}
