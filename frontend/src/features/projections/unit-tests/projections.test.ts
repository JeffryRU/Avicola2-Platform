import { describe, expect, it } from 'vitest'
import { addDays, daysText, weekStart } from '@/shared/domain/dates'
import { myDays, versusReal, weekAgg, type MyDay } from '@/features/projections/domain/aggregation'
import { Catalog } from '@/features/catalog/domain/catalog'
import { emptyDays, newDraft, submittableDraft } from '@/features/projections/domain/draft'
import { parseCell } from '@/shared/domain/format'
import { projectionsTable } from '@/features/projections/domain/export'
import { tableToCsv } from '@/shared/domain/export'
import type { Projection, Submission } from '@/features/projections/domain/schemas'

const catalog = new Catalog([
  { id: 'B2', category: 'BRASA', name: 'Brasa 2', kg_per_unit: 1.5, sort_order: 1 },
  { id: 'B1', category: 'BRASA', name: 'Brasa 1', kg_per_unit: 1.2, sort_order: 0 },
  { id: 'R1', category: 'OTRA', name: 'Otro 1', kg_per_unit: 0.9, sort_order: 2 },
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
    const all = weekAgg(ws, [], projections, sales, catalog)
    expect(all[0]).toMatchObject({ confirmed: true, u: 17 })
    expect(all[1].confirmed).toBe(false)
    expect(weekAgg(ws, ['ana'], projections, sales, catalog)[0].u).toBe(10)
    // Varios vendedores: suma solo los elegidos (uno sin datos no cambia nada).
    expect(weekAgg(ws, ['ana', 'nadie'], projections, sales, catalog)[0].u).toBe(10)
  })

  it('calcula exactitud y desviación con los días que tienen venta', () => {
    const vs = versusReal(weekAgg(ws, ['ana'], projections, sales, catalog), catalog)
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

describe('exportación', () => {
  const days: MyDay[] = [
    {
      date: '2026-11-04',
      category: 'BRASA',
      units: { B1: 10 },
      submittedAt: '2026-11-03T08:30:00Z',
      sync: 'ok' as const,
    },
    { date: '2026-11-03', category: 'BRASA', units: { B2: 2 }, submittedAt: '', sync: 'pending' as const },
  ]

  it('arma una fila por día y producto, ordenada por fecha, con kg y estado', () => {
    const table = projectionsTable(days, catalog, 'Juan Pérez', new Date('2026-11-03T12:00:00'))
    expect(table.columns.map((c) => c.label)).toContain('Kg por unidad')
    expect(table.rows).toHaveLength(4) // 2 días × 2 productos BRASA
    expect(table.rows[0]).toEqual(['2026-11-03', 'Mar', 'BRASA', 'B1', 'Brasa 1', 1.2, 0, 0, 'Por sincronizar', ''])
    expect(table.rows[3]).toEqual([
      '2026-11-04',
      'Mié',
      'BRASA',
      'B2',
      'Brasa 2',
      1.5,
      0,
      0,
      'Sincronizada',
      '2026-11-03 08:30',
    ])
    expect(table.rows[2][7]).toBe(12) // 10 unidades × 1,2 kg
  })

  it('el CSV lleva BOM y escapa comillas', () => {
    const csv = tableToCsv({
      title: '',
      subtitle: '',
      columns: [{ label: 'Producto', width: 5 }],
      rows: [['Pollo "entero"']],
    })
    expect(csv.startsWith('\uFEFF"Producto"')).toBe(true)
    expect(csv).toContain('"Pollo ""entero"""')
  })
})
