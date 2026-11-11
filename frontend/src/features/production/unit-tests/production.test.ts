import { describe, expect, it } from 'vitest'
import type { Product } from '@/features/catalog/domain/schemas'
import {
  deviation,
  draftOf,
  invalidQuality,
  productionDaySchema,
  toEntries,
  totals,
} from '@/features/production/domain/production'

const products: Product[] = [
  { id: 'P0003', category: 'BRASA', name: 'Brasa 3', kg_per_unit: 1.3, sort_order: 3, subcategory: 'Brasa chica' },
  { id: 'P0004', category: 'BRASA', name: 'Brasa 4', kg_per_unit: 1.4, sort_order: 4, subcategory: 'Brasa chica' },
]
const draft = {
  P0003: { ordered: '4050', produced: '1174', quality_b: '120' },
  P0004: { ordered: '', produced: '1668', quality_b: '400' },
}

describe('producción diaria', () => {
  it('suma lo pedido, lo que llegó y la calidad B', () => {
    const t = totals(products, draft)
    expect(t).toMatchObject({ ordered: 4050, produced: 2842, qualityB: 520 })
    expect(t.bShare).toBeCloseTo(520 / 2842)
    expect(deviation(4050, 2842)).toEqual({ birds: -1208, share: -1208 / 4050 })
    expect(deviation(0, 10)).toEqual({ birds: 10, share: 0 })
  })

  it('lo que queda en blanco se envía como 0', () => {
    expect(toEntries(products, draft)).toEqual([
      { product_id: 'P0003', ordered: 4050, produced: 1174, quality_b: 120 },
      { product_id: 'P0004', ordered: 0, produced: 1668, quality_b: 400 },
    ])
  })

  it('no deja guardar más calidad B que lo producido', () => {
    expect(invalidQuality(products, draft)).toEqual([])
    const bad = { ...draft, P0004: { ordered: '', produced: '10', quality_b: '11' } }
    expect(invalidQuality(products, bad).map((p) => p.name)).toEqual(['Brasa 4'])
  })

  it('carga lo ya registrado; los ceros se muestran vacíos', () => {
    const day = productionDaySchema.parse({
      date: '2026-11-02',
      lines: [{ product_id: 'P0003', ordered: 4050, produced: 1174, quality_a: 1174, quality_b: 0 }],
      ordered: 4050,
      produced: 1174,
      quality_b: 0,
      recorded_by: 'despacho',
      recorded_at: '2026-11-02T18:30:00-05:00',
    })
    expect(draftOf(products, day)).toEqual({
      P0003: { ordered: '4050', produced: '1174', quality_b: '' },
      P0004: { ordered: '', produced: '', quality_b: '' },
    })
  })
})
