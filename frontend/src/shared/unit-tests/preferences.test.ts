import { describe, expect, it } from 'vitest'
import { DEFAULT_A11Y } from '@/shared/domain/accessibility'
import { DEFAULT_APPEARANCE } from '@/shared/domain/appearance'
import { fromStored, preferencesKey, toStored, type UiPreferences } from '@/shared/domain/preferences'

const prefs: UiPreferences = {
  appearance: { theme: 'dark', contrast: 'high', accent: 'green' },
  a11y: { ...DEFAULT_A11Y, textSize: 'xlarge', readAloud: true },
}

describe('preferencias de la cuenta', () => {
  it('ida y vuelta sin perder nada', () => {
    expect(fromStored(JSON.parse(JSON.stringify(toStored(prefs))))).toEqual(prefs)
  })

  it('lo desconocido o roto vuelve a su valor por defecto', () => {
    expect(fromStored({ theme: 'sepia', accent: 42, a11y: { textSize: 'gigante', hideImages: 'sí' } })).toEqual({
      appearance: DEFAULT_APPEARANCE,
      a11y: DEFAULT_A11Y,
    })
    expect(fromStored(null)).toEqual({ appearance: DEFAULT_APPEARANCE, a11y: DEFAULT_A11Y })
  })

  it('la huella no depende del orden de las claves', () => {
    const reordered: UiPreferences = {
      appearance: { accent: 'green', contrast: 'high', theme: 'dark' },
      a11y: Object.fromEntries(Object.entries(prefs.a11y).reverse()) as UiPreferences['a11y'],
    }
    expect(preferencesKey(reordered)).toBe(preferencesKey(prefs))
    expect(preferencesKey({ ...prefs, appearance: { ...prefs.appearance, theme: 'light' } })).not.toBe(
      preferencesKey(prefs),
    )
  })
})
