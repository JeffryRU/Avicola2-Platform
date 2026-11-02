import { dDow } from '@/core/domain/dates'
import type { MyDay } from '@/modules/planning/domain/aggregation'
import type { Catalog } from '@/modules/planning/domain/catalog'

const HEADER = [
  'fecha',
  'dia',
  'categoria',
  'producto_id',
  'producto',
  'kg_por_unidad',
  'unidades',
  'kg',
  'sincronizacion',
  'enviado',
]

/** CSV de las proyecciones propias (una fila por día y producto), con BOM para Excel. */
export function projectionsCsv(days: MyDay[], catalog: Catalog): string {
  const rows: (string | number)[][] = [HEADER]
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const p of catalog.of(d.category)) {
      const u = d.units[p.id] ?? 0
      rows.push([
        d.date,
        dDow(d.date),
        d.category,
        p.id,
        p.name,
        p.kg_per_unit.toFixed(2),
        u,
        (u * p.kg_per_unit).toFixed(2),
        d.sync,
        d.submittedAt,
      ])
    }
  }
  return '﻿' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
}
