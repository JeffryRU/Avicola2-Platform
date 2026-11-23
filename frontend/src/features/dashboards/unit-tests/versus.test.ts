import { describe, expect, it } from 'vitest'
import { Catalog } from '@/features/catalog'
import { periodAgg, type Projection } from '@/features/projections'
import {
  bucketVersus,
  chartUnit,
  modelByDay,
  parseMeasure,
  productDeviation,
  unitsOf,
  versusDays,
  versusTotals,
} from '@/features/dashboards/domain/versus'
import { projectionParts, sheetRounds } from '@/features/dashboards/domain/sheets'
import { amountsText, chartTitle, measureSuffix } from '@/features/dashboards/types/versus'

const catalog = new Catalog([
  { id: 'B1', category: 'BRASA', name: 'Brasa 1', kg_per_unit: 1, sort_order: 0 },
  { id: 'B2', category: 'BRASA', name: 'Brasa 2', kg_per_unit: 2, sort_order: 1 },
  { id: 'B3', category: 'BRASA', name: 'Brasa 3', kg_per_unit: 3, sort_order: 2 },
  { id: 'X', category: 'OTRA', name: 'Sin proyectar', kg_per_unit: 1, sort_order: 0, projected: false },
])
const D1 = '2026-11-02'
const D2 = '2026-11-03'

const projection = (seller: string, date: string, units: Record<string, number>): Projection => ({
  id: `${seller}-${date}`,
  submission_id: 's',
  sheet: 1,
  seller,
  date,
  category: 'BRASA',
  status: 'confirmed',
  total_units: 0,
  total_kg: 0,
  submitted_at: `${date}T08:00:00Z`,
  units,
})

const projections = [projection('ana', D1, { B1: 10, B2: 5 }), projection('ana', D2, { B1: 4 })]
// Solo D1 tiene pedido: D2 no cuenta en la comparación.
const sales = [{ seller: 'ana', date: D1, units: { B1: 8, B2: 6 } }]
const days = periodAgg([D1, D2], [], projections, sales, catalog)

describe('medida de «Proyección vs pedido real»', () => {
  it('lee la medida de la URL; cualquier otra cosa es unidades', () => {
    expect(parseMeasure('kg')).toBe('kg')
    expect(parseMeasure('ambos')).toBe('ambos')
    expect(parseMeasure('litros')).toBe('unidades')
    expect(parseMeasure(null)).toBe('unidades')
  })

  it('elige las columnas y la medida del gráfico (con ambas, unidades primero y en el gráfico)', () => {
    expect(unitsOf('kg')).toEqual(['kg'])
    expect(unitsOf('unidades')).toEqual(['units'])
    expect(unitsOf('ambos')).toEqual(['units', 'kg'])
    expect(chartUnit('ambos')).toBe('units')
    expect(chartUnit('kg')).toBe('kg')
    expect(chartUnit('unidades')).toBe('units')
  })

  it('el título y los rótulos siguen a la medida', () => {
    expect(chartTitle('kg')).toBe('Evolución semanal (kg)')
    expect(chartTitle('unidades')).toBe('Evolución semanal (unid.)')
    expect(measureSuffix(unitsOf('ambos'))).toBe('(unid. / kg)')
    expect(amountsText({ kg: 12.5, units: 10 }, ['kg', 'units'])).toBe('12.5 kg · 10 unid.')
  })
})

describe('totales en kg y unidades', () => {
  it('compara solo los días con pedido', () => {
    const vs = versusTotals(days, catalog)
    expect(vs.daysWithReal).toBe(1)
    expect(vs.projected).toEqual({ kg: 20, units: 15 })
    expect(vs.real).toEqual({ kg: 20, units: 14 })
    expect(vs.diff).toEqual({ kg: 0, units: -1 })
    expect(vs.deviationPct.kg).toBe(0)
    expect(vs.deviationPct.units).toBeCloseTo((-1 / 15) * 100)
    expect(vs.accuracyPct.units).toBeCloseTo(100 - (1 / 15) * 100)
  })

  it('un pedido vacío del ERP (sin productos) es «sin dato», no «pidió 0» (no da −100 %)', () => {
    const [day] = periodAgg([D1], [], projections, [{ seller: 'ana', date: D1, units: {} }], catalog)
    expect(day.real).toBeNull()
    expect(versusTotals([day], catalog).daysWithReal).toBe(0)
  })

  it('sin pedidos, todo en cero', () => {
    const vs = versusTotals(periodAgg([D1], [], projections, [], catalog), catalog)
    expect(vs).toMatchObject({ daysWithReal: 0, deviationPct: { kg: 0, units: 0 }, accuracyPct: { kg: 0, units: 0 } })
  })
})

describe('desviación por producto', () => {
  it('muestra todos los productos proyectados, aunque no tengan datos, en el orden del catálogo', () => {
    const rows = productDeviation(days, catalog)
    expect(rows.map((r) => r.product.id)).toEqual(['B1', 'B2', 'B3'])
    const [b1, b2, b3] = rows
    expect(b1).toMatchObject({ projected: { kg: 10, units: 10 }, real: { kg: 8, units: 8 }, diff: { units: -2 } })
    expect(b1.pct.units).toBeCloseTo(-20)
    expect(b2).toMatchObject({ projected: { kg: 10, units: 5 }, real: { kg: 12, units: 6 } })
    expect(b3).toMatchObject({
      projected: { kg: 0, units: 0 },
      real: { kg: 0, units: 0 },
      pct: { kg: null, units: null },
    })
  })

  it('un producto que no se proyecta aparece solo si tiene cifras', () => {
    const withX = periodAgg([D1], [], projections, [{ seller: 'ana', date: D1, units: { X: 3 } }], catalog)
    const rows = productDeviation(withX, catalog)
    expect(rows.map((r) => r.product.id)).toEqual(['B1', 'B2', 'B3', 'X'])
    expect(rows[3]).toMatchObject({ real: { kg: 3, units: 3 }, pct: { kg: null } })
  })
})

describe('puntos del gráfico', () => {
  it('lleva proyección, pedido, modelo, rondas y partes en las dos medidas', () => {
    const rounds = sheetRounds([D1, D2], [], projections, [], catalog)
    const parts = projectionParts([D1, D2], [], projections, catalog.forProjection().products, [])
    const model = modelByDay([{ seller: 'ana', date: D1, units: { B2: 2 } }], [], catalog)
    const daily = versusDays(days, catalog, rounds, parts, model)
    expect(daily[0]).toMatchObject({
      projected: { kg: 20, units: 15 },
      real: { kg: 20, units: 14 },
      model: { kg: 4, units: 2 },
      earlier: [],
    })
    expect(daily[1]).toMatchObject({ real: null, model: null })
    expect(parts.units[D1]).toEqual([15])

    const [week] = bucketVersus(daily, [{ start: D1, dates: [D1, D2] }])
    expect(week).toMatchObject({
      confirmed: true,
      projected: { kg: 24, units: 19 },
      real: { units: 14 },
      model: { units: 2 },
    })
    expect(week.parts).toEqual([{ kg: 24, units: 19 }])
  })

  it('filtra el modelo por vendedor', () => {
    const rows = [
      { seller: 'ana', date: D1, units: { B1: 2 } },
      { seller: 'luis', date: D1, units: { B1: 5 } },
    ]
    expect(modelByDay(rows, ['luis'], catalog).get(D1)).toEqual({ kg: 5, units: 5 })
  })
})
