import { describe, expect, it } from 'vitest'
import { rangeDates } from '@/shared/domain/dates'
import { bucketsOf, granularityOf, sumBy } from '@/features/dashboards/domain/buckets'

describe('grupos de días para los gráficos', () => {
  it('día hasta 2 meses, semana hasta ~6 meses, mes en adelante', () => {
    expect(granularityOf(31)).toBe('day')
    expect(granularityOf(92)).toBe('week')
    expect(granularityOf(366)).toBe('month')
  })

  it('agrupa por semana (desde el lunes) y por mes, y suma solo lo conocido', () => {
    const dates = rangeDates('2026-08-29', 10) // sáb 29/08 … lun 07/09
    const weeks = bucketsOf(dates, 'week')
    expect(weeks.map((b) => b.dates.length)).toEqual([2, 7, 1])
    expect(bucketsOf(dates, 'month').map((b) => b.key)).toEqual(['2026-08', '2026-09'])
    const value = (d: string) => (d < '2026-09-01' ? 1 : null)
    expect(sumBy(bucketsOf(dates, 'month'), value)).toEqual([3, null])
  })
})
