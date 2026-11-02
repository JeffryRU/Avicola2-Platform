import { describe, expect, it } from 'vitest'
import { addDays, daysText, weekStart } from '@/core/domain/dates'
import { myDays, versusReal, weekAgg } from '@/modules/planning/domain/aggregation'
import { Catalog } from '@/modules/planning/domain/catalog'
import { emptyDays, newDraft, parseCell, submittableDraft } from '@/modules/planning/domain/draft'
import type { Projection, Submission } from '@/modules/planning/domain/schemas'

const catalog = new Catalog([
  { id: 'B2', category: 'BRASA', name: 'Brasa 2', kg_per_unit: 1.5, sort_order: 1 },
  { id: 'B1', category: 'BRASA', name: 'Brasa 1', kg_per_unit: 1.2, sort_order: 0 },
  { id: 'R1', category: 'BROASTER', name: 'Broaster 1', kg_per_unit: 0.9, sort_order: 2 },
])
const TODAY = '2026-11-02'

const projection = (seller: string, date: string, units: Record<string, number>): Projection => ({
  id: `${seller}-${date}`,
  submission_id: 's',
  seller,
  date,
  category: 'BRASA',
  status: 'confirmed',
  total_units: 0,
  total_kg: 0,
  submitted_at: `${date}T08:00:00Z`,
  units,
})

describe('catálogo', () => {
  it('ordena por categoría y calcula kg con el peso por unidad', () => {
    expect(catalog.of('BRASA').map((p) => p.id)).toEqual(['B1', 'B2'])
    expect(catalog.categories).toEqual(['BRASA', 'BROASTER'])
    expect(catalog.kg({ B1: 10, B2: 2 })).toBeCloseTo(15)
  })
})

describe('borrador de proyección', () => {
  it('exige unidades en cada día y fecha desde hoy', () => {
    const draft = { ...newDraft(TODAY, 'BRASA'), days: 2, units: { [TODAY]: { B1: 3 } } }
    expect(emptyDays(draft)).toEqual([addDays(TODAY, 1)])
    const result = submittableDraft(TODAY).safeParse(draft)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toContain('Ingresa al menos un producto')
    expect(submittableDraft(addDays(TODAY, 1)).safeParse({ ...draft, days: 1 }).success).toBe(false)
  })

  it('rechaza más de 7 días o unidades fuera de rango', () => {
    expect(submittableDraft(TODAY).safeParse({ ...newDraft(TODAY, 'BRASA'), days: 8 }).success).toBe(false)
    const big = { ...newDraft(TODAY, 'BRASA'), days: 1, units: { [TODAY]: { B1: 10000 } } }
    expect(submittableDraft(TODAY).safeParse(big).success).toBe(false)
  })

  it('las celdas aceptan solo dígitos (máximo 4)', () => {
    expect(parseCell('12a3')).toBe(123)
    expect(parseCell('123456')).toBe(1234)
    expect(parseCell('')).toBeNull()
  })

  it('describe los días como en el mockup', () => {
    expect(daysText([TODAY, addDays(TODAY, 1)], TODAY)).toBe('Hoy y mañana.')
  })
})

describe('agregados', () => {
  const ws = weekStart(TODAY)
  const projections = [projection('ana', ws, { B1: 10 }), projection('luis', ws, { B1: 5, B2: 2 })]
  const sales = [{ seller: 'ana', date: ws, units: { B1: 9 } }]

  it('suma todos los vendedores o filtra uno', () => {
    const all = weekAgg(ws, 'all', projections, sales, catalog)
    expect(all[0]).toMatchObject({ confirmed: true, u: 17 })
    expect(all[1].confirmed).toBe(false)
    expect(weekAgg(ws, 'ana', projections, sales, catalog)[0].u).toBe(10)
  })

  it('calcula exactitud y desviación con los días que tienen venta', () => {
    const vs = versusReal(weekAgg(ws, 'ana', projections, sales, catalog), catalog)
    expect(vs.daysWithReal).toBe(1)
    expect(vs.deviationPct).toBeCloseTo(-10)
    expect(vs.accuracyPct).toBeCloseTo(90)
  })

  it('la cola offline del vendedor reemplaza lo del servidor', () => {
    const queue: Submission[] = [
      { submission_id: 'q', seller: 'ana', category: 'BRASA', days: [{ date: ws, units: { B2: 1 } }], created_at: 'x' },
      {
        submission_id: 'o',
        seller: 'luis',
        category: 'BRASA',
        days: [{ date: ws, units: { B2: 9 } }],
        created_at: 'x',
      },
    ]
    const mine = myDays(projections, queue, 'ana').get(ws)
    expect(mine).toMatchObject({ sync: 'pending', units: { B2: 1 } })
  })
})
