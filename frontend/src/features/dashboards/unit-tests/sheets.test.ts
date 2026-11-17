import { describe, expect, it } from 'vitest'
import { Catalog } from '@/features/catalog'
import type { ProjectionChange } from '@/features/history'
import type { Projection } from '@/features/projections'
import { sheetRounds } from '@/features/dashboards/domain/sheets'

const catalog = new Catalog([
  { id: 'B1', category: 'BRASA', name: 'Brasa 1', kg_per_unit: 1, sort_order: 0 },
  { id: 'B2', category: 'BRASA', name: 'Brasa 2', kg_per_unit: 2, sort_order: 1 },
])
const D1 = '2026-11-18'
const D2 = '2026-11-19'

const projection = (seller: string, date: string, units: Record<string, number>, sheet = 1): Projection => ({
  id: `${seller}${date}`,
  submission_id: 's',
  seller,
  date,
  category: 'BRASA',
  status: 'confirmed',
  total_units: 0,
  total_kg: 0,
  submitted_at: '2026-11-17T10:00:00Z',
  units,
  sheet,
})
const change = (seller: string, date: string, sheet: number, after: Record<string, number>): ProjectionChange => ({
  id: sheet,
  seller,
  date,
  category: 'BRASA',
  author: seller,
  action: sheet === 1 ? 'created' : 'updated',
  before: null,
  after,
  before_total: null,
  after_total: 0,
  after_cutoff: false,
  changed_at: `2026-11-17T1${String(sheet)}:00:00Z`,
  sheet,
})

describe('rondas de hojas', () => {
  it('sin segundas hojas hay una sola ronda (la vigente)', () => {
    const r = sheetRounds([D1], [], [projection('ana', D1, { B1: 10 })], [change('ana', D1, 1, { B1: 10 })], catalog)
    expect(r.rounds).toBe(1)
    expect(r.kg[D1]).toEqual([10])
  })

  it('cada ronda suma la hoja k de cada vendedor, o su última si registró menos veces', () => {
    const projections = [projection('ana', D1, { B1: 12 }, 3), projection('beto', D1, { B2: 5 })]
    const changes = [
      change('ana', D1, 1, { B1: 10 }),
      change('ana', D1, 2, { B1: 8 }),
      change('ana', D1, 3, { B1: 12 }),
      change('beto', D1, 1, { B2: 5 }),
    ]
    const r = sheetRounds([D1, D2], [], projections, changes, catalog)
    expect(r.rounds).toBe(3)
    // Ana: 10 → 8 → 12 kg; Beto: 10 kg siempre.
    expect(r.kg[D1]).toEqual([20, 18, 22])
    expect(r.kg[D2]).toEqual([0, 0, 0])
  })

  it('filtra por vendedor y la última ronda siempre es la vigente', () => {
    // Sin historial (proyección anterior a las hojas): la vigente cuenta como única hoja.
    const projections = [projection('ana', D1, { B1: 4 }), projection('beto', D1, { B1: 7 }, 2)]
    const changes = [change('beto', D1, 1, { B1: 9 })]
    expect(sheetRounds([D1], ['beto'], projections, changes, catalog).kg[D1]).toEqual([9, 7])
    expect(sheetRounds([D1], [], projections, changes, catalog).kg[D1]).toEqual([13, 11])
  })
})
