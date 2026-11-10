import { describe, expect, it } from 'vitest'
import { missingSellers, sacaDays, sacaSchema } from '@/features/saca/domain/saca'

const plan = sacaSchema.parse({
  date: '2026-11-11',
  lines: [
    { product_id: 'P0001', projected: 150, ordered: 0, demand: 150, stock: 30, request: 120, request_kg: 120 },
    { product_id: 'P0006', projected: 40, ordered: 0, demand: 40, stock: 60, request: 0, request_kg: 0 },
  ],
  projected: 190,
  ordered: 0,
  demand: 190,
  stock: 90,
  request: 120,
  request_kg: 120,
  live_kg: 160,
  yield_factor: 0.75,
  stock_date: '2026-11-10',
  sellers_registered: 2,
  sellers_total: 7,
  orders_available: false,
})

describe('cálculo de saca', () => {
  it('ofrece desde ayer hasta una semana adelante', () => {
    const days = sacaDays('2026-11-10')
    expect(days).toHaveLength(9)
    expect(days[0]).toBe('2026-11-09')
    expect(days.at(-1)).toBe('2026-11-17')
  })

  it('cuenta los vendedores que aún no registraron', () => {
    expect(missingSellers(plan)).toBe(5)
  })
})
