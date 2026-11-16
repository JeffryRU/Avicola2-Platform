import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CONTRAST_KEY,
  CONTRAST_PREFERENCES,
  THEME_KEY,
  THEME_PREFERENCES,
  contrastFromSwitch,
  resolveAppearance,
  themeColor,
  type AppearancePreference,
  type SystemAppearance,
} from '@/shared/domain/appearance'
// El mismo archivo que sirve la app (Vite lo trae como texto).
import bootScript from '/public/appearance-boot.js?raw'

const system = (prefersDark: boolean, prefersMoreContrast: boolean): SystemAppearance => ({
  prefersDark,
  prefersMoreContrast,
})

describe('resolveAppearance', () => {
  it('sin elección, sigue al sistema (tema y contraste)', () => {
    const pref: AppearancePreference = { theme: 'system', contrast: 'system' }
    expect(resolveAppearance(pref, system(false, false))).toEqual({ theme: 'light', contrast: 'normal' })
    expect(resolveAppearance(pref, system(true, false))).toEqual({ theme: 'dark', contrast: 'normal' })
    expect(resolveAppearance(pref, system(false, true))).toEqual({ theme: 'light', contrast: 'high' })
  })

  it('la elección del usuario manda sobre el sistema', () => {
    expect(resolveAppearance({ theme: 'light', contrast: 'normal' }, system(true, true))).toEqual({
      theme: 'light',
      contrast: 'normal',
    })
    expect(resolveAppearance({ theme: 'dark', contrast: 'high' }, system(false, false))).toEqual({
      theme: 'dark',
      contrast: 'high',
    })
  })

  it('el tema y el contraste se resuelven por separado (propiedad)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...THEME_PREFERENCES),
        fc.constantFrom(...CONTRAST_PREFERENCES),
        fc.boolean(),
        fc.boolean(),
        (theme, contrast, dark, more) => {
          const r = resolveAppearance({ theme, contrast }, system(dark, more))
          // Oráculo escrito desde la regla: «sistema» copia la media query; si no, la elección.
          expect(r.theme).toBe(theme === 'system' ? (dark ? 'dark' : 'light') : theme)
          expect(r.contrast).toBe(contrast === 'system' ? (more ? 'high' : 'normal') : contrast)
        },
      ),
    )
  })
})

describe('contrastFromSwitch', () => {
  it('si el interruptor coincide con el sistema, vuelve a seguir al sistema', () => {
    expect(contrastFromSwitch(true, system(false, true))).toBe('system')
    expect(contrastFromSwitch(false, system(false, false))).toBe('system')
  })

  it('si lo contradice, guarda la elección', () => {
    expect(contrastFromSwitch(true, system(false, false))).toBe('high')
    expect(contrastFromSwitch(false, system(false, true))).toBe('normal')
  })

  it('el resultado siempre deja el contraste en lo que marca el interruptor (propiedad)', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (on, dark, more) => {
        const sys = system(dark, more)
        const r = resolveAppearance({ theme: 'system', contrast: contrastFromSwitch(on, sys) }, sys)
        expect(r.contrast).toBe(on ? 'high' : 'normal')
      }),
    )
  })
})

/** Ejecuta public/appearance-boot.js con un navegador de mentira y devuelve lo que aplicó. */
function runBoot(storage: Record<string, string | null>, media: { dark: boolean; more: boolean } | 'throws') {
  const attrs: Record<string, string> = {}
  const meta = { content: '', setAttribute: (_: string, v: string) => (meta.content = v) }
  const document = {
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
    querySelector: () => meta,
  }
  const window = {
    localStorage: { getItem: (k: string) => storage[k] ?? null },
    matchMedia: (q: string) => {
      if (media === 'throws') throw new Error('sin matchMedia')
      return { matches: q.includes('color-scheme') ? media.dark : media.more }
    },
  }
  // Se ejecuta el archivo real que sirve la app, con un navegador de mentira.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- es la prueba del script
  new Function('document', 'window', bootScript)(document, window)
  return { attrs, color: meta.content }
}

describe('public/appearance-boot.js (antes del primer pintado)', () => {
  const stored = fc.oneof(
    fc.constant(null),
    fc.constantFrom('light', 'dark', 'system', 'normal', 'high', 'noraves', 'rocio').map((v) => JSON.stringify(v)),
    fc.string(), // dato corrupto: no debe romper nada
  )

  it('aplica lo mismo que resolveAppearance y themeColor (propiedad)', () => {
    fc.assert(
      fc.property(stored, stored, stored, fc.boolean(), fc.boolean(), (t, c, b, dark, more) => {
        const { attrs, color } = runBoot({ [THEME_KEY]: t, [CONTRAST_KEY]: c, nv_brand: b }, { dark, more })
        const parse = (raw: string | null) => {
          try {
            return raw === null ? null : (JSON.parse(raw) as unknown)
          } catch {
            return null
          }
        }
        const pick = <T extends string>(raw: string | null, ok: readonly T[], fallback: T): T => {
          const v = parse(raw)
          return ok.includes(v as T) ? (v as T) : fallback
        }
        const pref: AppearancePreference = {
          theme: pick(t, THEME_PREFERENCES, 'system'),
          contrast: pick(c, CONTRAST_PREFERENCES, 'system'),
        }
        const brand = pick(b, ['noraves', 'rocio'] as const, 'noraves')
        const expected = resolveAppearance(pref, system(dark, more))
        expect(attrs).toEqual({ 'data-theme': expected.theme, 'data-contrast': expected.contrast, 'data-brand': brand })
        expect(color).toBe(themeColor(expected, brand))
      }),
    )
  })

  it('sin almacenamiento ni matchMedia, queda en claro y contraste normal', () => {
    const { attrs } = runBoot({}, 'throws')
    expect(attrs).toEqual({ 'data-theme': 'light', 'data-contrast': 'normal', 'data-brand': 'noraves' })
  })

  it('el sistema con más contraste activa el alto contraste por defecto', () => {
    expect(runBoot({}, { dark: false, more: true }).attrs['data-contrast']).toBe('high')
  })
})
