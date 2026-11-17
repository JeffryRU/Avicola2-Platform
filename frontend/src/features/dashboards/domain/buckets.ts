import { weekStart, type IsoDate } from '@/shared/domain/dates'

/**
 * Agrupa los días de un período para graficarlo: por día hasta 2 meses, por semana hasta
 * ~6 meses y por mes en adelante (un año día a día no se lee). TypeScript puro.
 */
export type Granularity = 'day' | 'week' | 'month'

export interface Bucket {
  key: string
  /** Primer día del grupo (para etiquetas y enlaces). */
  start: IsoDate
  dates: IsoDate[]
}

export const DAY_MAX = 62
export const WEEK_MAX = 190

export function granularityOf(days: number): Granularity {
  return days <= DAY_MAX ? 'day' : days <= WEEK_MAX ? 'week' : 'month'
}

export function bucketsOf(dates: IsoDate[], granularity: Granularity = granularityOf(dates.length)): Bucket[] {
  const keyOf = (d: IsoDate) => (granularity === 'day' ? d : granularity === 'week' ? weekStart(d) : d.slice(0, 7))
  const out: Bucket[] = []
  for (const d of dates) {
    const key = keyOf(d)
    const last = out.at(-1)
    if (last?.key === key) last.dates.push(d)
    else out.push({ key, start: d, dates: [d] })
  }
  return out
}

/** Suma por grupo (`null` si ningún día del grupo tiene dato). */
export function sumBy(buckets: Bucket[], value: (d: IsoDate) => number | null): (number | null)[] {
  return buckets.map((b) => {
    const known = b.dates.map(value).filter((v): v is number => v != null)
    return known.length ? known.reduce((a, v) => a + v, 0) : null
  })
}

/** Días con unidades y kg (como los de `periodAgg`), sumados por grupo para las barras. */
interface DayTotals {
  date: IsoDate
  u: number
  kg: number
  confirmed: boolean
}

export function sumDays(
  days: DayTotals[],
  granularity: Granularity = granularityOf(days.length),
): (Bucket & { u: number; kg: number; confirmed: boolean })[] {
  const byDate = new Map(days.map((d) => [d.date, d]))
  return bucketsOf(
    days.map((d) => d.date),
    granularity,
  ).map((b) => {
    const ds = b.dates.flatMap((d) => {
      const found = byDate.get(d)
      return found ? [found] : []
    })
    return {
      ...b,
      u: ds.reduce((a, d) => a + d.u, 0),
      kg: ds.reduce((a, d) => a + d.kg, 0),
      confirmed: ds.some((d) => d.confirmed),
    }
  })
}
