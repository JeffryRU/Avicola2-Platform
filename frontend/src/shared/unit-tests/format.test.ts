import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CELL_MAX_DIGITS,
  collapseSpaces,
  keepDigits,
  parseCell,
  parseDigits,
  parseUnits,
  RECORD_MAX_DIGITS,
  RECORD_MAX_UNITS,
  round2,
  toggleIn,
} from '@/shared/domain/format'

/** Oráculo desde la especificación: los dígitos ASCII escritos, en orden, sin mirar la implementación. */
const typedDigits = (raw: string) =>
  Array.from(raw)
    .filter((c) => c >= '0' && c <= '9')
    .join('')

/** Texto con dígitos, letras, signos y espacios mezclados (lo que alguien puede pegar en una celda). */
const typed = fc.string({ unit: fc.constantFrom(...'0123456789 .,-abcñ\t'.split('')), maxLength: 20 })

describe('lectura de números escritos a mano', () => {
  it('parseDigits toma los primeros dígitos y vacío es null', () => {
    fc.assert(
      fc.property(typed, fc.integer({ min: 1, max: 9 }), (raw, max) => {
        const digits = typedDigits(raw).slice(0, max)
        expect(keepDigits(raw, max)).toBe(digits)
        expect(parseDigits(raw, max)).toBe(digits === '' ? null : Number(digits))
      }),
    )
  })

  it('una celda de proyección acepta hasta 4 dígitos (máximo 9999)', () => {
    fc.assert(
      fc.property(typed, (raw) => {
        const digits = typedDigits(raw).slice(0, 4)
        expect(parseCell(raw)).toBe(digits === '' ? null : Number(digits))
      }),
    )
    expect(parseCell('12a345')).toBe(1234)
    expect(parseCell('  ')).toBeNull()
  })

  it('stock, producción y pedidos: hasta 7 dígitos y nunca más de 1 000 000', () => {
    fc.assert(
      fc.property(typed, (raw) => {
        const digits = typedDigits(raw).slice(0, 7)
        const expected = digits === '' ? null : Math.min(Number(digits), 1_000_000)
        expect(parseUnits(raw)).toBe(expected)
      }),
    )
    // Lo mismo que hacía features/stock antes de moverlo a shared.
    expect(parseUnits('1 2a3')).toBe(123)
    expect(parseUnits('9999999')).toBe(1_000_000)
    expect(parseUnits('00012345678')).toBe(1234) // solo los 7 primeros dígitos
    expect([CELL_MAX_DIGITS, RECORD_MAX_DIGITS, RECORD_MAX_UNITS]).toEqual([4, 7, 1_000_000])
    expect(parseUnits('')).toBeNull()
  })
})

describe('otros formatos comunes', () => {
  it('collapseSpaces deja las palabras separadas por un espacio y sin bordes', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom('a', 'b', ' ', '\t', '\n'), maxLength: 30 }), (raw) => {
        const out = collapseSpaces(raw)
        expect(out).toBe(out.trim())
        expect(out).not.toMatch(/\s\s|\t|\n/)
        // Mismos caracteres visibles, en el mismo orden.
        expect(out.replace(/\s/g, '')).toBe(raw.replace(/\s/g, ''))
        expect(collapseSpaces(out)).toBe(out)
      }),
    )
    expect(collapseSpaces('  Ana   Torres ')).toBe('Ana Torres')
  })

  it('round2 redondea a centésimos', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (n) => {
        const r = round2(n)
        expect(Math.abs(r - n)).toBeLessThanOrEqual(0.005 + 1e-9)
        expect(round2(r)).toBe(r)
      }),
    )
    expect(round2(1.234)).toBe(1.23)
    expect(round2(1.5 * 1.3)).toBe(1.95)
  })

  it('toggleIn marca lo que falta y desmarca lo que está (dos veces deja todo igual)', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 0, max: 20 })), fc.integer({ min: 0, max: 20 }), (list, v) => {
        const once = toggleIn(list, v)
        expect(once.includes(v)).toBe(!list.includes(v))
        expect(once.filter((x) => x !== v)).toEqual(list.filter((x) => x !== v))
        expect(new Set(toggleIn(once, v))).toEqual(new Set(list))
      }),
    )
  })
})
