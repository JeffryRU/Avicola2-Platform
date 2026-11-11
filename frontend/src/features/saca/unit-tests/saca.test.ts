import { describe, expect, it } from 'vitest'
import { missingSellers, parseFactors, sacaDays, sacaSchema } from '@/features/saca/domain/saca'

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
  farm_order: 96,
  groups: [
    { name: 'Brasa chica', projected: 150, ordered: 0, demand: 150, stock: 30, need: 120, factor: 0.8, farm_order: 96 },
    { name: 'Brasa mediana', projected: 40, ordered: 0, demand: 40, stock: 60, need: 0, factor: 0.7, farm_order: 0 },
  ],
})

describe('cálculo de saca', () => {
  it('ofrece desde ayer hasta una semana adelante', () => {
    const days = sacaDays('2026-11-10')
    expect(days).toHaveLength(9)
    expect(days[0]).toBe('2026-11-09')
    expect(days.at(-1)).toBe('2026-11-17')
  })

  it('usa la suma como forma de cálculo de partida y trae el pedido final por tipo', () => {
    expect(plan.method).toBe('sum')
    expect(plan.groups.map((g) => g.farm_order)).toEqual([96, 0])
    expect(plan.farm_order).toBe(96)
  })

  it('cuenta los vendedores que aún no registraron', () => {
    expect(missingSellers(plan)).toBe(5)
  })

  it('lee los factores escritos con coma o punto y rechaza los que no sirven', () => {
    expect(parseFactors({ 'Brasa chica': '0,8', 'Brasa grande': '1' })).toEqual({
      'Brasa chica': 0.8,
      'Brasa grande': 1,
    })
    expect(parseFactors({ 'Brasa chica': '' })).toBeNull()
    expect(parseFactors({ 'Brasa chica': 'abc' })).toBeNull()
    expect(parseFactors({ 'Brasa chica': '2.5' })).toBeNull()
  })
})
