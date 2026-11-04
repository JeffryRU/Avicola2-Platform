import { weekDates, type IsoDate } from '@/shared/domain/dates'
import { addUnits, sumUnits, type Catalog } from '@/features/catalog/domain/catalog'
import { CONFIRMED, type DailyUnits, type Projection, type Submission } from '@/features/projections/domain/schemas'
import { type Units } from '@/features/catalog/domain/schemas'

export type SyncState = 'ok' | 'pending'

/** Proyección propia de un día, tal como la ve el vendedor (incluye envíos aún en cola). */
export interface MyDay {
  date: IsoDate
  category: string
  units: Units
  submittedAt: string
  sync: SyncState
  error?: string | null
}

/** Lo confirmado en el servidor + lo que está en la cola del dispositivo (gana la cola). */
export function myDays(projections: Projection[], queue: Submission[], me: string): Map<IsoDate, MyDay> {
  const out = new Map<IsoDate, MyDay>()
  for (const p of projections) {
    if (p.seller === me && p.status === CONFIRMED) {
      out.set(p.date, { date: p.date, category: p.category, units: p.units, submittedAt: p.submitted_at, sync: 'ok' })
    }
  }
  for (const s of queue.filter((q) => q.seller === me)) {
    for (const d of s.days) {
      out.set(d.date, {
        date: d.date,
        category: s.category,
        units: d.units,
        submittedAt: s.created_at,
        sync: 'pending',
        error: s.error,
      })
    }
  }
  return out
}

export interface DayAgg {
  date: IsoDate
  confirmed: boolean
  units: Units
  u: number
  kg: number
  real: Units | null
}

/** Total de un día para los vendedores elegidos (lista vacía = todos). */
export function dayAgg(
  date: IsoDate,
  sellers: readonly string[],
  projections: Projection[],
  sales: DailyUnits[],
  catalog: Catalog,
): DayAgg {
  const pick = new Set(sellers)
  const mine = (x: { seller: string; date: string }) => x.date === date && (pick.size === 0 || pick.has(x.seller))
  const days = projections.filter((p) => mine(p) && p.status === CONFIRMED)
  const units = days.reduce<Units>((acc, p) => addUnits(acc, p.units), {})
  const realDays = sales.filter(mine)
  const real = realDays.length ? realDays.reduce<Units>((acc, s) => addUnits(acc, s.units), {}) : null
  return { date, confirmed: days.length > 0, units, u: sumUnits(units), kg: catalog.kg(units), real }
}

/** Un total por día de las fechas dadas (una semana o un rango personalizado). */
export const periodAgg = (
  dates: IsoDate[],
  sellers: readonly string[], // vacía = todos
  projections: Projection[],
  sales: DailyUnits[],
  catalog: Catalog,
) => dates.map((d) => dayAgg(d, sellers, projections, sales, catalog))

export const weekAgg = (
  ws: IsoDate,
  sellers: readonly string[], // vacía = todos
  projections: Projection[],
  sales: DailyUnits[],
  catalog: Catalog,
) => periodAgg(weekDates(ws), sellers, projections, sales, catalog)

/** Proyección vs venta real (kg) en los días que ya tienen venta. */
export function versusReal(days: DayAgg[], catalog: Catalog) {
  const withReal = days.flatMap((d) => (d.real ? [{ ...d, real: d.real }] : []))
  const projected = withReal.reduce((s, d) => s + d.kg, 0)
  const real = withReal.reduce((s, d) => s + catalog.kg(d.real), 0)
  const absError = withReal.reduce((s, d) => s + Math.abs(catalog.kg(d.real) - d.kg), 0)
  return {
    daysWithReal: withReal.length,
    projected,
    real,
    deviationPct: projected ? ((real - projected) / projected) * 100 : 0,
    accuracyPct: projected ? 100 - (absError / projected) * 100 : 0,
  }
}
