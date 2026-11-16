import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { niceMax } from '@/shared/domain/chart-scale'

describe('niceMax', () => {
  it('con máximo 10 y 4 divisiones, las marcas son enteras', () => {
    expect(niceMax(10, 4)).toBe(20)
    expect(niceMax(7, 4)).toBe(8)
    expect(niceMax(0, 4)).toBe(4)
  })

  it('cubre el valor y cada marca es un entero redondo (propiedad)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e7, noNaN: true }), fc.integer({ min: 2, max: 6 }), (m, n) => {
        const max = niceMax(m, n)
        const step = max / n
        expect(max).toBeGreaterThanOrEqual(m)
        expect(Number.isInteger(step)).toBe(true)
        // El paso es 1, 2 o 5 por una potencia de 10.
        const lead = step / Math.pow(10, Math.floor(Math.log10(step)))
        expect([1, 2, 5]).toContain(Math.round(lead * 1e9) / 1e9)
      }),
    )
  })
})
