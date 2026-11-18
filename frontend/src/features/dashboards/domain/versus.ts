import { z } from 'zod'
import { sumUnits, type Product, type Units } from '@/shared/domain/products'
import type { Catalog } from '@/features/catalog'
import type { periodAgg } from '@/features/projections'

/** Un día agregado (proyección y pedido de los vendedores elegidos). */
type DayAgg = ReturnType<typeof periodAgg>[number]

/**
 * «Proyección vs pedido real» en kg, en unidades o en ambas. Todo lo que la pantalla muestra
 * (KPIs, gráfico, tablas) sale de aquí con la medida elegida; la pantalla solo lo pinta.
 */

export const MEASURES = ['kg', 'unidades', 'ambos'] as const
export type Measure = (typeof MEASURES)[number]
export const DEFAULT_MEASURE: Measure = 'kg'
/** Parámetro de la URL con la medida (?medida=kg|unidades|ambos). */
export const MEASURE_PARAM = 'medida'

const measureSchema = z.enum(MEASURES)

/** La medida de la URL; cualquier otro valor (o ninguno) es kg. */
export const parseMeasure = (raw: string | null | undefined): Measure => {
  const parsed = measureSchema.safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_MEASURE
}

/** Una cifra en las dos medidas. */
export interface Amount {
  kg: number
  units: number
}

/** Una de las dos medidas (la que se grafica o la de una columna). */
export type Unit = keyof Amount

/** Qué medidas se muestran, en orden (kg primero). */
export const unitsOf = (m: Measure): Unit[] => (m === 'kg' ? ['kg'] : m === 'unidades' ? ['units'] : ['kg', 'units'])

/**
 * La medida del gráfico: con «ambos» se grafica en kg (es la que suma productos de distinto peso
 * sin engañar) y las unidades van en el detalle de cada punto y en la tabla de abajo.
 */
export const chartUnit = (m: Measure): Unit => (m === 'unidades' ? 'units' : 'kg')

const zero = (): Amount => ({ kg: 0, units: 0 })
const add = (a: Amount, b: Amount): Amount => ({ kg: a.kg + b.kg, units: a.units + b.units })

/** Unidades y kg de un conjunto de productos. */
export const amountOf = (units: Units, catalog: Catalog): Amount => ({ kg: catalog.kg(units), units: sumUnits(units) })

/** Variación de `real` frente a `projected` en %; sin proyección no hay variación. */
export const deviationPct = (projected: number, real: number): number | null =>
  projected ? ((real - projected) / projected) * 100 : null

export interface VersusTotals {
  daysWithReal: number
  projected: Amount
  real: Amount
  /** Diferencia (pedido − proyección). */
  diff: Amount
  /** Desviación en % (0 sin proyección, como antes). */
  deviationPct: Amount
  /** 100 − error absoluto diario / proyección, en %. */
  accuracyPct: Amount
}

/** Proyección vs pedido real en los días que ya tienen pedido, en kg y en unidades. */
export function versusTotals(days: DayAgg[], catalog: Catalog): VersusTotals {
  let projected = zero()
  let real = zero()
  let absError = zero()
  let daysWithReal = 0
  for (const d of days) {
    if (!d.real) continue
    daysWithReal++
    const p = { kg: d.kg, units: d.u }
    const r = amountOf(d.real, catalog)
    projected = add(projected, p)
    real = add(real, r)
    absError = add(absError, { kg: Math.abs(r.kg - p.kg), units: Math.abs(r.units - p.units) })
  }
  const pct = (u: Unit) => deviationPct(projected[u], real[u]) ?? 0
  const acc = (u: Unit) => (projected[u] ? 100 - (absError[u] / projected[u]) * 100 : 0)
  return {
    daysWithReal,
    projected,
    real,
    diff: { kg: real.kg - projected.kg, units: real.units - projected.units },
    deviationPct: { kg: pct('kg'), units: pct('units') },
    accuracyPct: { kg: acc('kg'), units: acc('units') },
  }
}

export interface ProductDeviation {
  product: Product
  projected: Amount
  real: Amount
  diff: Amount
  /** null si el producto no tuvo proyección (no hay contra qué comparar). */
  pct: { kg: number | null; units: number | null }
}

/**
 * Desviación de cada producto en los días con pedido: todos los productos que se proyectan (aunque
 * no tengan datos, en cero) y, además, cualquier otro que tenga cifras; en el orden del catálogo.
 */
export function productDeviation(days: DayAgg[], catalog: Catalog): ProductDeviation[] {
  const withReal = days.filter((d) => d.real)
  return catalog.products.flatMap((product) => {
    const u = (pick: (d: DayAgg) => Units | null) => withReal.reduce((s, d) => s + (pick(d)?.[product.id] ?? 0), 0)
    const pu = u((d) => d.units)
    const ru = u((d) => d.real)
    if (product.projected === false && !pu && !ru) return []
    const projected = { units: pu, kg: pu * product.kg_per_unit }
    const real = { units: ru, kg: ru * product.kg_per_unit }
    return [
      {
        product,
        projected,
        real,
        diff: { kg: real.kg - projected.kg, units: real.units - projected.units },
        pct: { kg: deviationPct(projected.kg, real.kg), units: deviationPct(projected.units, real.units) },
      },
    ]
  })
}

/** Total del modelo por día (kg y unidades) con el filtro de vendedores (vacío = todos). */
export function modelByDay(
  rows: { seller: string; date: string; units: Units }[],
  sellers: readonly string[],
  catalog: Catalog,
): Map<string, Amount> {
  const out = new Map<string, Amount>()
  for (const row of rows) {
    if (sellers.length && !sellers.includes(row.seller)) continue
    out.set(row.date, add(out.get(row.date) ?? zero(), amountOf(row.units, catalog)))
  }
  return out
}

/** Suma de cifras que pueden faltar: null si ninguna está. */
export function sumKnownAmounts(xs: (Amount | null)[]): Amount | null {
  const vals = xs.filter((v): v is Amount => v != null)
  return vals.length ? vals.reduce(add, zero()) : null
}

export const sumAmounts = (xs: Amount[]): Amount => xs.reduce(add, zero())

/** Un día (o un grupo de días) del gráfico, en las dos medidas. */
export interface VersusPoint {
  date: string
  /** Tiene proyección confirmada. */
  confirmed: boolean
  /** Proyección vigente. */
  projected: Amount
  /** Pedido real (null: aún no llega). */
  real: Amount | null
  /** Sugerencia del modelo (null: no hay). */
  model: Amount | null
  /** Rondas anteriores a la vigente (la 1 primero). */
  earlier: Amount[]
  /** Partes de la proyección vigente (por tamaño o producto). */
  parts: Amount[]
}

/**
 * Puntos diarios del gráfico. `rounds` y `parts` vienen de `sheetRounds` y `projectionParts`
 * (kg y unidades por día); `model`, de `modelByDay`.
 */
export function versusDays(
  days: DayAgg[],
  catalog: Catalog,
  rounds: { rounds: number; kg: Record<string, number[]>; units: Record<string, number[]> },
  parts: { kg: Record<string, number[]>; units: Record<string, number[]> },
  model: Map<string, Amount>,
): VersusPoint[] {
  return days.map((d) => {
    const pair = (src: { kg: Record<string, number[]>; units: Record<string, number[]> }, n: number) =>
      Array.from({ length: n }, (_, k) => ({ kg: src.kg[d.date]?.[k] ?? 0, units: src.units[d.date]?.[k] ?? 0 }))
    return {
      date: d.date,
      confirmed: d.confirmed,
      projected: { kg: d.kg, units: d.u },
      real: d.real ? amountOf(d.real, catalog) : null,
      model: model.get(d.date) ?? null,
      earlier: rounds.rounds > 1 ? pair(rounds, rounds.rounds - 1) : [],
      parts: pair(parts, parts.kg[d.date]?.length ?? 0),
    }
  })
}

/**
 * Agrupa los puntos diarios por semana o mes (`buckets`). La proyección cuenta solo los días con
 * proyección; el pedido y el modelo, los días que los tienen (null si ninguno).
 */
export function bucketVersus(daily: VersusPoint[], buckets: { start: string; dates: string[] }[]): VersusPoint[] {
  const rounds = Math.max(0, ...daily.map((p) => p.earlier.length))
  const partsCount = Math.max(0, ...daily.map((p) => p.parts.length))
  return buckets.map((b) => {
    const ps = daily.filter((p) => b.dates.includes(p.date))
    const conf = ps.filter((p) => p.confirmed)
    return {
      date: b.start,
      confirmed: conf.length > 0,
      projected: sumAmounts(conf.map((p) => p.projected)),
      real: sumKnownAmounts(ps.map((p) => p.real)),
      model: sumKnownAmounts(ps.map((p) => p.model)),
      // Un día sin hojas anteriores cuenta con su proyección vigente.
      earlier: Array.from({ length: rounds }, (_, r) => sumAmounts(conf.map((p) => p.earlier[r] ?? p.projected))),
      parts: Array.from({ length: partsCount }, (_, k) => sumAmounts(conf.map((p) => p.parts[k] ?? zero()))),
    }
  })
}
