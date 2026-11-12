import { describe, expect, it } from 'vitest'
import type { Product } from '@/features/catalog/domain/schemas'
import {
  ALL,
  byLocation,
  defaultView,
  draftOf,
  draftTotals,
  editableDays,
  isEditableDay,
  linesAt,
  locationsOf,
  parseUnits,
  shownLots,
  stockDaySchema,
  storeView,
  storedView,
  toEntries,
  toggleLot,
  visibleGroups,
} from '@/features/stock/domain/stock'

const item = (id: string, name: string, kg: number, subcategory: string | null, quality = 'A', category = 'BRASA') =>
  ({ id, category, name, kg_per_unit: kg, sort_order: 1, subcategory, quality }) satisfies Product
const items: Product[] = [
  item('P0001', 'Brasa 1', 1, 'Brasa chica'),
  item('P0101', 'Brasa chica B', 1.3, 'Brasa chica', 'B'),
  item('P0006', 'Brasa 6', 1.6, 'Brasa mediana'),
  item('P0011', 'Pollo entero con menudencia', 2, null, 'A', 'Pollo de mercado'),
]
const day = stockDaySchema.parse({
  date: '2026-11-10',
  lines: [
    { product_id: 'P0001', units: 100, kg: 100, location: 'Trujillo', lot_date: '2026-11-09' },
    { product_id: 'P0001', units: 30, kg: 30, location: 'Trujillo', lot_date: '2026-11-05' },
    { product_id: 'P0101', units: 40, kg: 52, location: 'Trujillo', lot_date: '2026-11-09' },
    { product_id: 'P0001', units: 5, kg: 5, location: 'Piura', lot_date: '2026-11-09' },
  ],
  total_units: 175,
  total_kg: 187,
  recorded_by: 'despacho',
  recorded_at: '2026-11-10T23:30:00Z',
})

describe('stock de despacho', () => {
  it('solo se registra hoy y los 7 días anteriores', () => {
    expect(isEditableDay('2026-11-10', '2026-11-10')).toBe(true)
    expect(isEditableDay('2026-11-03', '2026-11-10')).toBe(true)
    expect(isEditableDay('2026-11-02', '2026-11-10')).toBe(false)
    expect(isEditableDay('2026-11-11', '2026-11-10')).toBe(false)
    expect(editableDays('2026-11-10')).toHaveLength(8)
    expect(parseUnits('1 2a3')).toBe(123)
    expect(parseUnits('')).toBeNull()
  })

  it('filtra por ubicación y junta todas cuando no se elige ninguna', () => {
    expect(linesAt(day, 'Piura')).toHaveLength(1)
    expect(linesAt(day, ALL)).toHaveLength(4)
    expect(byLocation(day)).toEqual([
      { location: 'Trujillo', units: 170 },
      { location: 'Piura', units: 5 },
    ])
    // Una ubicación con stock ya registrado se ofrece aunque no esté en la lista configurada.
    expect(locationsOf(['Trujillo', 'Chiclayo'], [day])).toEqual(['Trujillo', 'Chiclayo', 'Piura'])
  })

  it('muestra los lotes elegidos y también los que ya tienen cantidades', () => {
    const lines = linesAt(day, 'Trujillo')
    expect(shownLots('2026-11-10', [0, 1], lines)).toEqual(['2026-11-05', '2026-11-09', '2026-11-10'])
    expect(toggleLot([0, 1], 3)).toEqual([0, 1, 3])
    expect(toggleLot([0, 1], 1)).toEqual([0])
    expect(toggleLot([2], 2)).toEqual([2]) // siempre queda al menos un lote
  })

  it('filtra por tipo y calidad', () => {
    expect(visibleGroups(items, { type: ALL, quality: ALL }).map((g) => g.name)).toEqual([
      'Brasa chica',
      'Brasa mediana',
      'Pollo de mercado',
    ])
    const onlyB = visibleGroups(items, { type: ALL, quality: 'B' })
    expect(onlyB.flatMap((g) => g.items.map((p) => p.id))).toEqual(['P0101'])
    expect(visibleGroups(items, { type: 'Brasa chica', quality: 'A' })[0]?.items.map((p) => p.id)).toEqual(['P0001'])
  })

  it('suma lo escrito, separa calidad A y B y calcula los kg', () => {
    const draft = draftOf(linesAt(day, 'Trujillo'))
    expect(draft).toEqual({ 'P0001|2026-11-09': '100', 'P0001|2026-11-05': '30', 'P0101|2026-11-09': '40' })
    expect(draftTotals(items, draft)).toEqual({ units: 170, kg: 182, unitsA: 130, unitsB: 40 })
    // En «todas las ubicaciones» se suman las celdas del mismo artículo y lote.
    expect(draftOf(linesAt(day, ALL))['P0001|2026-11-09']).toBe('105')
  })

  it('envía solo las celdas con cantidad, o un cero para dejar constancia', () => {
    const draft = { 'P0001|2026-11-09': '100', 'P0006|2026-11-10': '', 'P0011|2026-11-10': '7' }
    expect(toEntries(items, draft, '2026-11-10')).toEqual([
      { product_id: 'P0001', units: 100, lot_date: '2026-11-09' },
      { product_id: 'P0011', units: 7, lot_date: '2026-11-10' },
    ])
    expect(toEntries(items, {}, '2026-11-10')).toEqual([{ product_id: 'P0001', units: 0, lot_date: '2026-11-10' }])
  })

  it('recuerda cómo se mira el stock y vuelve a la vista de partida si lo guardado no sirve', () => {
    const data = new Map<string, string>()
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
    expect(storedView(storage, 3)).toEqual(defaultView(3))
    expect(defaultView(3).lots).toEqual([0, 1, 2, 3])
    const mine = { ...defaultView(3), lots: [1, 4], location: 'Piura', unit: 'both' as const, quality: 'B' as const }
    storeView(storage, mine)
    expect(storedView(storage)).toEqual(mine)
    data.set('stock.view', '{"lots":[]}')
    expect(storedView(storage, 2).lots).toEqual([0, 1, 2])
  })
})
