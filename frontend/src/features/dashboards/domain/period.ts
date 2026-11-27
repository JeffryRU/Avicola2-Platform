import { addDays, diffDays, rangeDates, today, weekStart, type IsoDate } from '@/shared/domain/dates'

/** Largo máximo de un rango personalizado (días). */
export const PERIOD_MAX_DAYS = 366
/** Hasta cuántos días atrás se puede consultar un rango personalizado. */
export const PERIOD_HISTORY_DAYS = 1095

/** Un mes como AAAA-MM (el valor de `?mes=` en la URL). */
export type YearMonth = string

export type PeriodKind = 'week' | 'month' | 'custom'

/**
 * Período que muestran los dashboards: una semana (lunes a domingo), un mes (del 1 al último día)
 * o un rango personalizado.
 */
export interface Period {
  kind: PeriodKind
  /** Cualquier período que no es una semana (para los textos: «período» en vez de «semana»). */
  custom: boolean
  from: IsoDate
  to: IsoDate
  dates: IsoDate[]
}

export const weekPeriod = (ws: IsoDate): Period => ({
  kind: 'week',
  custom: false,
  from: ws,
  to: addDays(ws, 6),
  dates: rangeDates(ws, 7),
})

export const customPeriod = (from: IsoDate, to: IsoDate): Period => ({
  kind: 'custom',
  custom: true,
  from,
  to,
  dates: rangeDates(from, diffDays(to, from) + 1),
})

/** Fechas permitidas para un rango personalizado: 3 años atrás (toda la historia cargada) hasta el fin de la semana próxima. */
export function periodLimits(ref: IsoDate = today()) {
  return { min: addDays(ref, -PERIOD_HISTORY_DAYS), max: addDays(weekStart(ref), 13) }
}

/** Parámetro de la URL con el mes (?mes=2026-11). */
export const MONTH_PARAM = 'mes'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export const monthOf = (d: IsoDate): YearMonth => d.slice(0, 7)

/** El mes `n` meses después (o antes, si es negativo). */
export function shiftMonth(ym: YearMonth, n: number): YearMonth {
  const [y, m] = ym.split('-').map(Number)
  const index = y * 12 + (m - 1) + n
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** Primer y último día de un mes. */
export function monthBounds(ym: YearMonth): { from: IsoDate; to: IsoDate } {
  return { from: `${ym}-01`, to: addDays(`${shiftMonth(ym, 1)}-01`, -1) }
}

/** ¿El mes tiene algún día dentro de `periodLimits`? */
export function monthAllowed(ym: YearMonth, ref: IsoDate = today()): boolean {
  const { min, max } = periodLimits(ref)
  const { from, to } = monthBounds(ym)
  return from <= max && to >= min
}

/** El mes de la URL si es válido y está dentro de los límites; si no, null. */
export function parseMonth(raw: string | null | undefined, ref: IsoDate = today()): YearMonth | null {
  return raw && MONTH_RE.test(raw) && monthAllowed(raw, ref) ? raw : null
}

/**
 * Un mes completo, del 1 al último día. Si el mes cruza un límite de `periodLimits` (el mes en curso
 * puede terminar después de la semana próxima), se recorta a lo permitido.
 */
export function monthPeriod(ym: YearMonth, ref: IsoDate = today()): Period {
  const { min, max } = periodLimits(ref)
  const b = monthBounds(ym)
  const from = b.from < min ? min : b.from
  const to = b.to > max ? max : b.to
  return { kind: 'month', custom: true, from, to, dates: rangeDates(from, diffDays(to, from) + 1) }
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
