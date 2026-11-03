import { addDays, today, weekStart, type IsoDate } from '@/shared/domain/dates'

/** Semanas que ofrecen los filtros: la actual y las 3 anteriores (lunes de cada una). */
export const weekOptions = (ref: IsoDate = today()) => [0, 1, 2, 3].map((i) => addDays(weekStart(ref), -7 * i))
