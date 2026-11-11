import { describe, expect, it } from 'vitest'
import type { Product } from '@/features/catalog/domain/schemas'
import {
  draftOf,
  draftTotals,
  editableDays,
  invalidKg,
  isEditableDay,
  parseKg,
  parseUnits,
  stockDaySchema,
  toEntries,
} from '@/features/stock/domain/stock'

const products: Product[] = [
  { id: 'P0001', category: 'BRASA', name: 'Brasa 1', kg_per_unit: 1, sort_order: 1, subcategory: 'Brasa chica' },
  { id: 'P0006', category: 'BRASA', name: 'Brasa 6', kg_per_unit: 1.6, sort_order: 6, subcategory: 'Brasa mediana' },
]

describe('stock de despacho', () => {
  it('solo se registra hoy y los 7 días anteriores', () => {
    expect(isEditableDay('2026-11-10', '2026-11-10')).toBe(true)
    expect(isEditableDay('2026-11-03', '2026-11-10')).toBe(true)
    expect(isEditableDay('2026-11-02', '2026-11-10')).toBe(false)
    expect(isEditableDay('2026-11-11', '2026-11-10')).toBe(false)
    expect(editableDays('2026-11-10')).toHaveLength(8)
    expect(editableDays('2026-11-10')[0]).toBe('2026-11-10')
  })

  it('lee unidades y kg como los escribe la persona', () => {
    expect(parseUnits('1.250')).toBe(1250)
    expect(parseUnits('')).toBeNull()
    expect(parseKg('118,4')).toBe(118.4)
    expect(parseKg('64.25')).toBe(64.25)
    expect(parseKg('')).toBeNull()
    expect(parseKg('12.345')).toBeNull()
    expect(invalidKg({ P0001: { units: '1', kg: '1.234' } })).toBe(true)
    expect(invalidKg({ P0001: { units: '1', kg: '' } })).toBe(false)
  })

  it('sin kg escrito usa el peso promedio; en blanco cuenta como 0', () => {
    const draft = { P0001: { units: '120', kg: '118,4' }, P0006: { units: '40', kg: '' } }
    expect(draftTotals(products, draft)).toEqual({ units: 160, kg: 182.4 })
    expect(toEntries(products, draft)).toEqual([
      { product_id: 'P0001', units: 120, kg: 118.4 },
      { product_id: 'P0006', units: 40 },
    ])
    expect(toEntries(products, draftOf(products))).toEqual([
      { product_id: 'P0001', units: 0 },
      { product_id: 'P0006', units: 0 },
    ])
  })

  it('carga en el formulario lo ya registrado', () => {
    const day = stockDaySchema.parse({
      date: '2026-11-10',
      lines: [
        { product_id: 'P0001', units: 5, kg: 4.9 },
        { product_id: 'P0006', units: 0, kg: 0 },
      ],
      total_units: 5,
      total_kg: 4.9,
      recorded_by: 'despacho',
      recorded_at: '2026-11-10T18:30:00-05:00',
    })
    expect(draftOf(products, day)).toEqual({ P0001: { units: '5', kg: '4.9' }, P0006: { units: '', kg: '' } })
  })
})
