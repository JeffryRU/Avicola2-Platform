import { describe, expect, it } from 'vitest'
import type { Seller } from '@/features/auth/domain/session'
import { Catalog } from '@/features/catalog/domain/catalog'
import { teamDay } from '@/features/dashboards/domain/team-day'
import type { Projection } from '@/features/projections/domain/schemas'

const catalog = new Catalog([
  { id: 'P1', category: 'BRASA', name: 'Brasa 1', kg_per_unit: 1, sort_order: 0, subcategory: 'Brasa chica' },
  { id: 'P5', category: 'BRASA', name: 'Brasa 5', kg_per_unit: 1.5, sort_order: 1, subcategory: 'Brasa mediana' },
])
const seller = (username: string, name: string): Seller => ({ username, name, zone: 'Trujillo', role: 'seller' })
const SELLERS = [seller('ana', 'Ana'), seller('beto', 'Beto'), seller('caro', 'Caro')]
const DAY = '2026-11-03'

const projection = (who: string, units: Record<string, number>, status = 'confirmed'): Projection => ({
  id: `${who}-${DAY}`,
  submission_id: 's',
  sheet: 1,
  seller: who,
  date: DAY,
  category: 'BRASA',
  status,
  total_units: 0,
  total_kg: 0,
  submitted_at: `${DAY}T08:30:00Z`,
  units,
})

describe('día del equipo', () => {
  it('suma a los vendedores que confirmaron y deja a los pendientes al final', () => {
    const day = teamDay(
      DAY,
      SELLERS,
      [projection('beto', { P1: 4 }), projection('caro', { P1: 2, P5: 2 }), projection('ana', { P1: 9 }, 'draft')],
      [{ seller: 'caro', date: DAY, units: { P1: 2, P5: 1 } }],
      catalog,
    )
    expect(day.rows.map((r) => [r.seller.username, r.confirmed, r.u])).toEqual([
      ['beto', true, 4],
      ['caro', true, 4],
      ['ana', false, 0],
    ])
    expect(day.confirmed).toBe(2)
    expect(day.units).toEqual({ P1: 6, P5: 2 })
    expect(day.kg).toBe(9)
    expect(day.realKg).toBe(3.5)
    expect(day.rows[1].realKg).toBe(3.5)
    expect(day.rows[0].real).toBeNull()
  })

  it('sin ventas, la venta real queda vacía', () => {
    expect(teamDay(DAY, SELLERS, [], [], catalog).real).toBeNull()
  })
})
