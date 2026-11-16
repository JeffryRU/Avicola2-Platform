import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  clockTime,
  dateOf,
  dDowLongDM,
  diffDays,
  isRecentDay,
  recentDays,
  recentDayStrip,
  relativeDay,
  timeOf,
} from '@/shared/domain/dates'

/** Fechas ISO entre 2020 y 2035 (incluye cambios de mes y años bisiestos). */
const isoDate = fc
  .date({ min: new Date(2020, 0, 1), max: new Date(2035, 11, 31), noInvalidDate: true })
  .map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)

describe('registro de días pasados (stock y producción)', () => {
  it('se puede registrar hoy y hasta `backDays` días atrás, nunca un día futuro', () => {
    fc.assert(
      fc.property(isoDate, fc.integer({ min: -30, max: 30 }), fc.integer({ min: 0, max: 14 }), (ref, offset, back) => {
        expect(isRecentDay(addDays(ref, offset), ref, back)).toBe(offset <= 0 && offset >= -back)
      }),
    )
  })

  it('la tira tiene los días recientes, del más nuevo al más viejo, y agrega un día abierto desde la lista', () => {
    fc.assert(
      fc.property(isoDate, fc.integer({ min: -30, max: 0 }), fc.integer({ min: 0, max: 14 }), (ref, offset, back) => {
        const days = recentDays(ref, back)
        expect(days).toHaveLength(back + 1)
        days.forEach((d, i) => expect(diffDays(ref, d)).toBe(i))
        const day = addDays(ref, offset)
        const strip = recentDayStrip(day, ref, back)
        expect(strip.slice(0, back + 1)).toEqual(days)
        expect(strip).toContain(day)
        expect(strip).toHaveLength(isRecentDay(day, ref, back) ? back + 1 : back + 2)
      }),
    )
  })
})

describe('instantes con zona del negocio', () => {
  it('dateOf y timeOf leen la fecha y la hora tal como vienen, sin la zona del navegador', () => {
    expect(dateOf('2026-11-05T07:00:00-05:00')).toBe('2026-11-05')
    expect(timeOf('2026-11-05T07:00:00-05:00')).toBe('07:00')
    expect(dateOf('2026-11-05T23:59:00-05:00')).toBe('2026-11-05')
  })

  it('clockTime muestra la hora local con a. m./p. m.', () => {
    const at = new Date(2026, 10, 5, 15, 7).toISOString()
    expect(clockTime(at)).toBe('03:07 p. m.')
  })
})

describe('nombres de días', () => {
  it('dDowLongDM: "Jueves 05/11" (título de un día)', () => {
    expect(dDowLongDM('2026-11-05')).toBe('Jueves 05/11')
  })

  it('relativeDay usa los textos comunes', () => {
    expect(relativeDay('2026-11-05', '2026-11-05')).toBe('Hoy')
    expect(relativeDay('2026-11-04', '2026-11-05')).toBe('Ayer')
    expect(relativeDay('2026-11-06', '2026-11-05')).toBe('Mañana')
    expect(relativeDay('2026-11-07', '2026-11-05')).toBe('Pasado mañana')
    expect(relativeDay('2026-11-01', '2026-11-05')).toBeNull()
  })
})
