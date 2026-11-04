import { describe, expect, it } from 'vitest'
import {
  PERIOD_MAX_DAYS,
  checkPeriod,
  customPeriod,
  periodLimits,
  previousDates,
  weekPeriod,
} from '@/features/dashboards/domain/period'

const TODAY = '2026-11-04' // miércoles

describe('período de los dashboards', () => {
  it('una semana va de lunes a domingo y se compara con la anterior', () => {
    const p = weekPeriod('2026-11-02')
    expect(p.dates).toHaveLength(7)
    expect(p.to).toBe('2026-11-08')
    expect(previousDates(p)[0]).toBe('2026-10-26')
  })

  it('un rango personalizado incluye ambos extremos y se compara con los mismos días de antes', () => {
    const p = customPeriod('2026-10-28', '2026-11-03')
    expect(p.dates).toHaveLength(7)
    expect(p.dates.at(-1)).toBe('2026-11-03')
    expect(previousDates(p)).toEqual(customPeriod('2026-10-21', '2026-10-27').dates)
  })

  it('valida orden, largo máximo y límites', () => {
    const { min, max } = periodLimits(TODAY)
    expect(max).toBe('2026-11-15') // fin de la semana próxima
    expect(checkPeriod('2026-11-03', '2026-11-01', TODAY)).toBe('order')
    expect(checkPeriod('2026-10-01', '2026-11-04', TODAY)).toBe('too_long')
    expect(checkPeriod(min, min, TODAY)).toBeNull()
    expect(checkPeriod('2026-11-10', '2026-11-16', TODAY)).toBe('out_of_range')
    const last = customPeriod('2026-10-16', '2026-11-15')
    expect(last.dates).toHaveLength(PERIOD_MAX_DAYS)
    expect(checkPeriod(last.from, last.to, TODAY)).toBeNull()
  })
})
