import { describe, expect, it } from 'vitest'
import type { Seller } from '@/features/auth/domain/session'
import { Catalog } from '@/features/catalog/domain/catalog'
import { dayColumns, productMatrix, sellerColumns, zonesOf } from '@/features/dashboards/domain/product-matrix'
import type { Projection } from '@/features/projections/domain/schemas'

const catalog = new Catalog([
  { id: 'P1', category: 'BRASA', name: 'Brasa 1', kg_per_unit: 1, sort_order: 0, subcategory: 'Brasa chica' },
  { id: 'P2', category: 'BRASA', name: 'Brasa 2', kg_per_unit: 1.2, sort_order: 1, subcategory: 'Brasa chica' },
  { id: 'P5', category: 'BRASA', name: 'Brasa 5', kg_per_unit: 1.5, sort_order: 2, subcategory: 'Brasa mediana' },
])
const seller = (username: string, name: string, zone: string | null): Seller => ({
  username,
  name,
  zone,
  role: 'seller',
})
const SELLERS = [
  seller('mcordova', 'Miguel', 'Piura'),
  seller('rnavarro', 'Roberto', 'Trujillo'),
  seller('cv', 'César', 'Trujillo'),
]
const MON = '2026-11-02'
const TUE = '2026-11-03'

const projection = (who: string, date: string, units: Record<string, number>, status = 'confirmed'): Projection => ({
  id: `${who}-${date}`,
  submission_id: 's',
  sheet: 1,
  seller: who,
  date,
  category: 'BRASA',
  status,
  total_units: 0,
  total_kg: 0,
  submitted_at: `${date}T08:30:00Z`,
  units,
})

const DATA = [
  projection('rnavarro', MON, { P1: 3, P5: 2 }),
  projection('rnavarro', TUE, { P1: 1 }),
  projection('cv', TUE, { P2: 5 }),
  projection('mcordova', TUE, { P5: 4 }, 'draft'),
]

describe('detalle por producto', () => {
  it('por vendedor: columnas agrupadas por zona y filas por tamaño, solo lo confirmado', () => {
    const m = productMatrix(sellerColumns(SELLERS, [MON, TUE], 'Sin zona'), catalog.products, DATA)
    expect(m.columns.map((c) => c.key)).toEqual(['mcordova', 'cv', 'rnavarro'])
    expect(m.headerGroups).toEqual([
      { name: 'Piura', span: 1 },
      { name: 'Trujillo', span: 2 },
    ])
    expect(m.groups.map((g) => [g.name, g.rows.map((r) => r.product.id)])).toEqual([
      ['Brasa chica', ['P1', 'P2']],
      ['Brasa mediana', ['P5']],
    ])
    expect(m.groups[0].rows[0].cells).toEqual([0, 0, 4])
    expect(m.cells).toEqual([0, 5, 6])
    expect(m.total).toBe(11)
    expect(m.kg).toBeCloseTo(4 + 6 + 3)
  })

  it('filtra por día y por zona', () => {
    const m = productMatrix(sellerColumns(SELLERS, [TUE], 'Sin zona', ['Trujillo']), catalog.products, DATA)
    expect(m.columns.map((c) => c.key)).toEqual(['cv', 'rnavarro'])
    expect(m.cells).toEqual([5, 1])
  })

  it('varios días y varias zonas a la vez', () => {
    const both = sellerColumns(SELLERS, [MON, TUE], 'Sin zona', ['Piura', 'Trujillo'])
    const m = productMatrix(both, catalog.products, DATA)
    expect(m.columns.map((c) => c.key)).toEqual(['mcordova', 'cv', 'rnavarro'])
    expect(m.cells).toEqual([0, 5, 6])
    const monday = productMatrix(sellerColumns(SELLERS, [MON], 'Sin zona', ['Trujillo']), catalog.products, DATA)
    expect(monday.cells).toEqual([0, 5])
  })

  it('por día: una columna por fecha, para un vendedor', () => {
    const m = productMatrix(
      dayColumns([MON, TUE], 'rnavarro', (d) => d),
      catalog.of('BRASA', 'Brasa chica'),
      DATA,
    )
    expect(m.cells).toEqual([3, 1])
    expect(m.groups).toHaveLength(1)
    expect(m.headerGroups).toEqual([{ name: null, span: 2 }])
  })

  it('zonas del equipo, con «Sin zona» para quien no tiene', () => {
    expect(zonesOf([...SELLERS, seller('x', 'X', null)], 'Sin zona')).toEqual(['Piura', 'Sin zona', 'Trujillo'])
  })
})
