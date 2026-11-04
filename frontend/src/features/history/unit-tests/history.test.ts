import { describe, expect, it } from 'vitest'
import { Catalog } from '@/features/catalog/domain/catalog'
import { bySupervisor, changedLines, type ProjectionChange } from '@/features/history/domain/history'
import { unitsChange } from '@/features/history/types/history'

const catalog = new Catalog([
  { id: 'P1', category: 'BRASA', name: 'Brasa 1', kg_per_unit: 1, sort_order: 0 },
  { id: 'P2', category: 'BRASA', name: 'Brasa 2', kg_per_unit: 1.2, sort_order: 1 },
])

const change = (before: Record<string, number> | null, after: Record<string, number>): ProjectionChange => ({
  id: 1,
  seller: 'rnavarro',
  date: '2026-11-05',
  category: 'BRASA',
  author: 'supervisor',
  action: before ? 'updated' : 'created',
  before,
  after,
  before_total: before ? Object.values(before).reduce((a, b) => a + b, 0) : null,
  after_total: Object.values(after).reduce((a, b) => a + b, 0),
  after_cutoff: true,
  changed_at: '2026-11-04T20:10:00-05:00',
})

describe('historial de cambios', () => {
  it('muestra solo los productos que cambiaron', () => {
    const lines = changedLines(change({ P1: 4, P2: 2 }, { P1: 9, P2: 2 }), catalog)
    expect(lines).toEqual([{ product: 'Brasa 1', before: 4, after: 9 }])
  })

  it('en una creación lista lo que tiene unidades', () => {
    expect(changedLines(change(null, { P1: 0, P2: 5 }), catalog).map((l) => l.product)).toEqual(['Brasa 2'])
  })

  it('marca lo que cambió el supervisor y formatea el total', () => {
    expect(bySupervisor(change(null, { P1: 1 }))).toBe(true)
    expect(unitsChange(4, 9)).toBe('4 → 9')
    expect(unitsChange(null, 4)).toBe('4')
  })
})
