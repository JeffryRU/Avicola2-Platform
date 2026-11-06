import { describe, expect, it } from 'vitest'
import { Catalog } from '@/features/catalog/domain/catalog'
import { MISSING_LABEL, teamProjectionsTable } from '@/features/dashboards/domain/export'
import type { Projection } from '@/features/projections/domain/schemas'

const catalog = new Catalog([
  { id: 'P1', name: 'Brasa 1', category: 'BRASA', subcategory: null, kg_per_unit: 1.5 },
  { id: 'P2', name: 'Brasa 2', category: 'BRASA', subcategory: null, kg_per_unit: 2 },
] as never)

const sellers = [
  { username: 'b', name: 'Beto', zone: 'Piura', role: 'seller' },
  { username: 'a', name: 'Ana', zone: 'Chiclayo', role: 'seller' },
] as never

const projection: Projection = {
  id: '1',
  submission_id: 's',
  seller: 'a',
  date: '2026-11-05',
  category: 'BRASA',
  status: 'confirmed',
  total_units: 10,
  total_kg: 15,
  submitted_at: '2026-11-04T18:30:00-05:00',
  units: { P1: 10 },
}

describe('Excel del equipo', () => {
  it('una fila por producto, la venta real y «Sin proyección» para quien no registró', () => {
    const table = teamProjectionsTable({
      dates: ['2026-11-05'],
      sellers,
      projections: [projection],
      sales: [{ seller: 'a', date: '2026-11-05', units: { P1: 8 } }],
      catalog,
      period: 'Semana',
      generatedAt: new Date('2026-11-06T10:00:00-05:00'),
    })
    // Ordenado por zona: Chiclayo (Ana) antes que Piura (Beto).
    expect(table.rows.map((r) => [r[3], r[6], r[8], r[9], r[10], r[11]])).toEqual([
      ['Ana', 'Brasa 1', 10, 15, 8, 'Confirmada'],
      ['Ana', 'Brasa 2', 0, 0, 0, 'Confirmada'],
      ['Beto', '', '', '', '', MISSING_LABEL],
    ])
    expect(table.rows[0][12]).toBe('2026-11-04 18:30')
    expect(table.subtitle).toContain('1 sin proyección')
  })
})
