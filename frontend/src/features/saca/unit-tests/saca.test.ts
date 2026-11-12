import { describe, expect, it } from 'vitest'
import { SACA_METHOD, missingSellers, parsePlus, sacaDays, sacaSchema } from '@/features/saca/domain/saca'

const plan = sacaSchema.parse({
  date: '2026-11-12',
  orders_date: '2026-11-13',
  projection_date: '2026-11-14',
  method: 'stock_orders_projection_plus',
  plus: 5500,
  lines: [
    { product_id: 'P0001', projected: 150, ordered: 40, demand: 140, stock: 30, request: 140, request_kg: 140 },
    { product_id: 'P0006', projected: 0, ordered: 100, demand: -40, stock: 60, request: 0, request_kg: 0 },
  ],
  projected: 150,
  ordered: 140,
  demand: 100,
  stock: 90,
  request: 140,
  request_kg: 140,
  live_kg: 186,
  yield_factor: 0.75,
  stock_date: '2026-11-12',
  stock_b: 10,
  sellers_registered: 2,
  sellers_total: 7,
  orders_available: true,
  farm_order: 5600,
  groups: [
    {
      name: 'Brasa chica',
      stock: 30,
      stock_b: 10,
      ordered: 40,
      projected: 150,
      plus: 4000,
      balance: 140,
      farm_order: 4140,
    },
    { name: 'Brasa mediana', stock: 60, ordered: 100, projected: 0, plus: 1500, balance: -40, farm_order: 1460 },
  ],
})

describe('cálculo de saca', () => {
  it('ofrece desde ayer hasta una semana adelante, empezando por hoy en la segunda posición', () => {
    const days = sacaDays('2026-11-12')
    expect(days).toHaveLength(9)
    expect(days[0]).toBe('2026-11-11')
    expect(days[1]).toBe('2026-11-12')
    expect(days.at(-1)).toBe('2026-11-19')
  })

  it('lee las fechas usadas, el plus y el pedido final por tipo', () => {
    expect(plan.method).toBe(SACA_METHOD)
    expect(plan.orders_date).toBe('2026-11-13')
    expect(plan.projection_date).toBe('2026-11-14')
    expect(plan.plus).toBe(5500)
    expect(plan.groups.map((g) => [g.balance, g.plus, g.farm_order])).toEqual([
      [140, 4000, 4140],
      [-40, 1500, 1460],
    ])
    expect(plan.groups[1]?.stock_b).toBe(0)
    expect(plan.lines[1]?.demand).toBe(-40)
  })

  it('cuenta los vendedores que aún no registraron', () => {
    expect(missingSellers(plan)).toBe(5)
  })

  it('lee el plus con o sin separador de miles y rechaza lo que no sirve', () => {
    expect(
      parsePlus({ 'Brasa chica': '4,000', 'Brasa mediana': '1500', 'Brasa grande': '1 500', Mercado: '0' }),
    ).toEqual({ 'Brasa chica': 4000, 'Brasa mediana': 1500, 'Brasa grande': 1500, Mercado: 0 })
    expect(parsePlus({ 'Brasa chica': '100.000' })).toEqual({ 'Brasa chica': 100000 })
    expect(parsePlus({ 'Brasa chica': '' })).toBeNull()
    expect(parsePlus({ 'Brasa chica': '-5' })).toBeNull()
    expect(parsePlus({ 'Brasa chica': '4.5' })).toBeNull()
    expect(parsePlus({ 'Brasa chica': 'abc' })).toBeNull()
    expect(parsePlus({ 'Brasa chica': '100001' })).toBeNull()
  })
})
