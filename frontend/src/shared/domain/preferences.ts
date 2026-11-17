/**
 * Preferencias de la interfaz que siguen a la cuenta (tema, contraste, color y accesibilidad).
 * TypeScript puro. El backend las guarda tal cual (solo acota su forma); aquí se decide el formato
 * y se sanea lo que vuelve: lo que no se reconozca toma su valor por defecto.
 */
import { ACCENT_IDS, CONTRAST_PREFERENCES, DEFAULT_APPEARANCE, THEME_PREFERENCES } from '@/shared/domain/appearance'
import type { AppearancePreference } from '@/shared/domain/appearance'
import { sanitizeA11y, type A11yPreference } from '@/shared/domain/accessibility'

export interface UiPreferences {
  appearance: AppearancePreference
  a11y: A11yPreference
}

/** Formato guardado en la cuenta: tema, contraste y color sueltos; la accesibilidad, agrupada. */
export interface StoredPreferences {
  theme: string
  contrast: string
  accent: string
  a11y: Record<string, string | boolean>
}

export function toStored({ appearance, a11y }: UiPreferences): StoredPreferences {
  return { theme: appearance.theme, contrast: appearance.contrast, accent: appearance.accent, a11y: { ...a11y } }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const pick = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

export function fromStored(raw: unknown): UiPreferences {
  const o = isObject(raw) ? raw : {}
  return {
    appearance: {
      theme: pick(THEME_PREFERENCES, o.theme, DEFAULT_APPEARANCE.theme),
      contrast: pick(CONTRAST_PREFERENCES, o.contrast, DEFAULT_APPEARANCE.contrast),
      accent: pick(ACCENT_IDS, o.accent, DEFAULT_APPEARANCE.accent),
    },
    a11y: sanitizeA11y(o.a11y),
  }
}

/** Huella para comparar dos preferencias sin depender del orden en que se armaron. */
export function preferencesKey(p: UiPreferences): string {
  const s = toStored(p)
  const a11y = Object.fromEntries(Object.entries(s.a11y).sort(([a], [b]) => a.localeCompare(b)))
  return JSON.stringify([s.theme, s.contrast, s.accent, a11y])
}
