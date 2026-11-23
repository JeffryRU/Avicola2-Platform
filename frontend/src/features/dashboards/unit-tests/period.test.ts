import { describe, expect, it } from 'vitest'
import {
  PERIOD_MAX_DAYS,
  monthAllowed,
  monthBounds,
  monthOf,
  monthPeriod,
  parseMonth,
  shiftMonth,
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
    expect(checkPeriod('2025-09-01', '2026-11-04', TODAY)).toBe('too_long')
    expect(checkPeriod(min, min, TODAY)).toBeNull()
    expect(checkPeriod('2026-11-10', '2026-11-16', TODAY)).toBe('out_of_range')
    // 366 días que terminan en el último día permitido.
    const last = customPeriod('2025-11-15', '2026-11-15')
    expect(last.dates).toHaveLength(PERIOD_MAX_DAYS)
    expect(checkPeriod(last.from, last.to, TODAY)).toBeNull()
  })
})

describe('período mensual', () => {
  const TODAY = '2026-11-04'

  it('va del 1 al último día del mes, también en febrero bisiesto y en diciembre', () => {
    expect(monthBounds('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(monthBounds('2028-02').to).toBe('2028-02-29')
    expect(monthBounds('2026-12').to).toBe('2026-12-31')
    const p = monthPeriod('2026-10', TODAY)
    expect(p.kind).toBe('month')
    expect(p.dates).toHaveLength(31)
    expect(p.dates[0]).toBe('2026-10-01')
    expect(p.dates.at(-1)).toBe('2026-10-31')
    // Se compara con los 31 días justo antes.
    expect(previousDates(p)[0]).toBe('2026-08-31')
  })

  it('navega al mes anterior y siguiente cruzando el año', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-11', 0)).toBe('2026-11')
    expect(monthOf('2026-11-17')).toBe('2026-11')
  })

  it('lee ?mes= solo si es válido y está dentro de los límites', () => {
    expect(parseMonth('2026-11', TODAY)).toBe('2026-11')
    expect(parseMonth('2026-13', TODAY)).toBeNull()
    expect(parseMonth('nov-2026', TODAY)).toBeNull()
    expect(parseMonth(null, TODAY)).toBeNull()
    expect(parseMonth('2020-01', TODAY)).toBeNull() // más de 3 años atrás
    expect(parseMonth('2027-03', TODAY)).toBeNull() // más allá de la semana próxima
  })

  it('recorta el mes en curso a lo permitido', () => {
    // Hoy es 2026-11-04: lo permitido llega hasta el 15 de noviembre.
    const p = monthPeriod('2026-11', TODAY)
    expect(p.from).toBe('2026-11-01')
    expect(p.to).toBe('2026-11-15')
    expect(checkPeriod(p.from, p.to, TODAY)).toBeNull()
    expect(monthAllowed('2026-12', TODAY)).toBe(false)
  })
})
