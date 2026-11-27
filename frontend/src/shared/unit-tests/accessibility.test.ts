import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  A11Y_KEY,
  DEFAULT_A11Y,
  a11yAttributes,
  activeA11yCount,
  sanitizeA11y,
  TEXT_SIZES,
} from '@/shared/domain/accessibility'
// El mismo archivo que sirve la app (Vite lo trae como texto).
import bootScript from '/public/appearance-boot.js?raw'

/** Ejecuta public/appearance-boot.js con un navegador de mentira y devuelve los atributos de <html>. */
function runBoot(stored: string | null) {
  const attrs: Record<string, string> = {}
  const document = {
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
    querySelector: () => null,
  }
  const window = {
    localStorage: { getItem: (k: string) => (k === A11Y_KEY ? stored : null) },
    matchMedia: () => ({ matches: false }),
  }
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- es la prueba del script
  new Function('document', 'window', bootScript)(document, window)
  return attrs
}

const parse = (raw: string | null): unknown => {
  try {
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

describe('accesibilidad', () => {
  it('sin nada guardado, todo queda normal', () => {
    expect(sanitizeA11y(null)).toEqual(DEFAULT_A11Y)
    expect(activeA11yCount(DEFAULT_A11Y)).toBe(0)
  })

  it('un campo raro vuelve a su valor normal sin tocar los demás', () => {
    expect(sanitizeA11y({ textSize: 'enorme', underlineLinks: true, reduceMotion: 'si' })).toEqual({
      ...DEFAULT_A11Y,
      underlineLinks: true,
    })
  })

  it('public/appearance-boot.js aplica lo mismo que sanitizeA11y + a11yAttributes (propiedad)', () => {
    const value = fc.oneof(fc.boolean(), fc.constantFrom(...TEXT_SIZES), fc.string(), fc.constant(null))
    const stored = fc.oneof(
      fc.constant(null),
      fc.string(),
      fc
        .record({
          textSize: value,
          reduceMotion: value,
          underlineLinks: value,
          textSpacing: value,
          readableFont: value,
          strongFocus: value,
          hideImages: value,
          readAloud: value,
        })
        .map((o) => JSON.stringify(o)),
    )
    fc.assert(
      fc.property(stored, (raw) => {
        expect(runBoot(raw)).toMatchObject(a11yAttributes(sanitizeA11y(parse(raw))))
      }),
    )
  })
})
