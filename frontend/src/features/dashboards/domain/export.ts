import { dDow, type IsoDate } from '@/shared/domain/dates'
import type { Seller } from '@/features/auth/domain/session'
import type { Catalog } from '@/features/catalog/domain/catalog'
import { CONFIRMED, type DailyUnits, type Projection } from '@/features/projections/domain/schemas'
import type { ExportColumn, ExportTable } from '@/shared/domain/export'

const COLUMNS: ExportColumn[] = [
  { label: 'Fecha', width: 11 },
  { label: 'Día', width: 5 },
  { label: 'Zona', width: 12 },
  { label: 'Vendedor', width: 20 },
  { label: 'Categoría', width: 11 },
  { label: 'Código', width: 7 },
  { label: 'Producto', width: 14 },
  { label: 'Kg por unidad', width: 9, numeric: true },
  { label: 'Unidades', width: 9, numeric: true },
  { label: 'Kg', width: 9, numeric: true },
  { label: 'Venta real (unid.)', width: 11, numeric: true },
  { label: 'Estado', width: 14 },
  { label: 'Enviado', width: 17 },
]

export const MISSING_LABEL = 'Sin proyección'
const STATUS: Record<string, string> = { [CONFIRMED]: 'Confirmada' }
const round2 = (n: number) => Math.round(n * 100) / 100
const sentAt = (iso: string) => iso.slice(0, 16).replace('T', ' ')

/**
 * Proyecciones del equipo en el período: una fila por día, vendedor y producto (con la venta
 * real si ya llegó), y una fila «Sin proyección» por cada vendedor que no registró ese día.
 */
export function teamProjectionsTable({
  dates,
  sellers,
  projections,
  sales,
  catalog,
  period,
  generatedAt,
}: {
  dates: IsoDate[]
  sellers: Seller[]
  projections: Projection[]
  sales: DailyUnits[]
  catalog: Catalog
  period: string
  generatedAt: Date
}): ExportTable {
  const team = [...sellers].sort((a, b) => (a.zone ?? '').localeCompare(b.zone ?? '') || a.name.localeCompare(b.name))
  const real = new Map(sales.map((s) => [`${s.seller}|${s.date}`, s.units]))
  const rows: (string | number)[][] = []
  for (const date of dates) {
    for (const seller of team) {
      const base = [date, dDow(date), seller.zone ?? '', seller.name]
      const own = projections
        .filter((p) => p.seller === seller.username && p.date === date)
        .sort((a, b) => a.category.localeCompare(b.category))
      if (!own.length) {
        rows.push([...base, '', '', '', '', '', '', '', MISSING_LABEL, ''])
        continue
      }
      const sold = real.get(`${seller.username}|${date}`)
      for (const p of own) {
        for (const product of catalog.of(p.category)) {
          const units = p.units[product.id] ?? 0
          rows.push([
            ...base,
            p.category,
            product.id,
            product.name,
            product.kg_per_unit,
            units,
            round2(units * product.kg_per_unit),
            sold ? (sold[product.id] ?? 0) : '',
            STATUS[p.status] ?? p.status,
            sentAt(p.submitted_at),
          ])
        }
      }
    }
  }
  const missing = rows.filter((r) => r[11] === MISSING_LABEL).length
  return {
    title: 'Proyecciones del equipo',
    subtitle: `${period} · ${String(team.length)} vendedores · ${String(missing)} sin proyección · generado el ${generatedAt.toLocaleString('es-PE')}`,
    columns: COLUMNS,
    rows,
  }
}
