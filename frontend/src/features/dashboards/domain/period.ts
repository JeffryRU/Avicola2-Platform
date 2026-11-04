import { addDays, diffDays, rangeDates, today, weekStart, type IsoDate } from '@/shared/domain/dates'

/** Largo máximo de un rango personalizado (días). */
export const PERIOD_MAX_DAYS = 31
/** Hasta cuántos días atrás se puede consultar un rango personalizado. */
export const PERIOD_HISTORY_DAYS = 120

/** Período que muestran los dashboards: una semana (lunes a domingo) o un rango personalizado. */
export interface Period {
  custom: boolean
  from: IsoDate
  to: IsoDate
  dates: IsoDate[]
}

export const weekPeriod = (ws: IsoDate): Period => ({
  custom: false,
  from: ws,
  to: addDays(ws, 6),
  dates: rangeDates(ws, 7),
})

export const customPeriod = (from: IsoDate, to: IsoDate): Period => ({
  custom: true,
  from,
  to,
  dates: rangeDates(from, diffDays(to, from) + 1),
})

/** Fechas permitidas para un rango personalizado: 120 días atrás hasta el fin de la semana próxima. */
export function periodLimits(ref: IsoDate = today()) {
  return { min: addDays(ref, -PERIOD_HISTORY_DAYS), max: addDays(weekStart(ref), 13) }
}

export type PeriodError = 'order' | 'too_long' | 'out_of_range'

/** Valida un rango personalizado; null si es válido. */
export function checkPeriod(from: IsoDate, to: IsoDate, ref: IsoDate = today()): PeriodError | null {
  const { min, max } = periodLimits(ref)
  if (to < from) return 'order'
  if (from < min || to > max) return 'out_of_range'
  if (diffDays(to, from) + 1 > PERIOD_MAX_DAYS) return 'too_long'
  return null
}

/** El mismo número de días justo antes del período (para las variaciones). */
export const previousDates = (p: Period): IsoDate[] => rangeDates(addDays(p.from, -p.dates.length), p.dates.length)
