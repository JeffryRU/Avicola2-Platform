import { describe, expect, it } from 'vitest'
import {
  arrivalForecastSchema,
  project,
  projectionTotals,
  requestDraftOf,
  type ForecastGroup,
} from '@/features/production/domain/forecast'

const groups: ForecastGroup[] = [
  {
    name: 'Brasa chica',
    last_ordered: 1000,
    products: [
      { product_id: 'P0003', share: 0.4, quality_a_rate: 1 },
      { product_id: 'P0004', share: 0.6, quality_a_rate: 0.75 },
    ],
  },
  { name: 'Brasa mediana', last_ordered: 0, products: [{ product_id: 'P0006', share: 1, quality_a_rate: 1 }] },
]

describe('pronóstico de llegada', () => {
  it('parte de lo último que se pidió de cada tipo', () => {
    expect(requestDraftOf(groups)).toEqual({ 'Brasa chica': '1000', 'Brasa mediana': '' })
  })

  it('reparte lo pedido de cada tipo entre sus rangos', () => {
    const projected = project(groups, { 'Brasa chica': '2000', 'Brasa mediana': '' })
    expect(projected[0]).toMatchObject({ requested: 2000, expected: 2000 })
    expect(projected[0]?.lines).toEqual([
      { product_id: 'P0003', expected: 800, expectedA: 800, expectedB: 0 },
      { product_id: 'P0004', expected: 1200, expectedA: 900, expectedB: 300 },
    ])
    expect(projected[1]).toMatchObject({ requested: 0, expected: 0 })
    expect(projectionTotals(projected)).toEqual({
      requested: 2000,
      expected: 2000,
      expectedA: 1700,
      expectedB: 300,
      aShare: 0.85,
      largest: 1200,
    })
  })

  it('acepta la respuesta sin historia suficiente', () => {
    const parsed = arrivalForecastSchema.parse({
      available: false,
      method: 'exponential_smoothing',
      half_life_days: 7,
      min_days: 14,
      days: 0,
      date_from: null,
      date_to: null,
      groups: [],
      accuracy: null,
    })
    expect(parsed.available).toBe(false)
  })
})
