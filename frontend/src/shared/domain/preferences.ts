/**
 * Preferencias de la interfaz que siguen a la cuenta (tema, contraste, color, accesibilidad y el
 * estilo del panel de apariencia con los temas propios).
 * TypeScript puro. El backend las guarda tal cual (solo acota su forma); aquí se decide el formato
 * y se sanea lo que vuelve: lo que no se reconozca toma su valor por defecto.
 */
import { ACCENT_IDS, CONTRAST_PREFERENCES, DEFAULT_APPEARANCE, THEME_PREFERENCES } from '@/shared/domain/appearance'
import type { AppearancePreference } from '@/shared/domain/appearance'
import { sanitizeA11y, type A11yPreference } from '@/shared/domain/accessibility'
import { lookFromStored, lookToStored, type LookPreference } from '@/shared/domain/look'

export interface UiPreferences {
  appearance: AppearancePreference
  a11y: A11yPreference
  /** Estilo (temas, figuras); falta si la cuenta aún no guardó uno. */
  look?: LookPreference
}

/** Formato guardado en la cuenta: tema, contraste y color sueltos; la accesibilidad, agrupada. */
export interface StoredPreferences {
  theme: string
  contrast: string
  accent: string
  a11y: Record<string, string | boolean>
  /** Grupos del estilo (`look` y un `lt_<id>` por tema propio): ver look.ts. */
  [group: string]: string | Record<string, string | boolean>
}

export function toStored({ appearance, a11y, look }: UiPreferences): StoredPreferences {
  return {
    theme: appearance.theme,
    contrast: appearance.contrast,
    accent: appearance.accent,
    a11y: { ...a11y },
    ...(look ? lookToStored(look) : {}),
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const pick = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

export function fromStored(raw: unknown): UiPreferences {
  const o = isObject(raw) ? raw : {}
  const look = lookFromStored(o)
  return {
    appearance: {
      theme: pick(THEME_PREFERENCES, o.theme, DEFAULT_APPEARANCE.theme),
      contrast: pick(CONTRAST_PREFERENCES, o.contrast, DEFAULT_APPEARANCE.contrast),
      accent: pick(ACCENT_IDS, o.accent, DEFAULT_APPEARANCE.accent),
    },
    a11y: sanitizeA11y(o.a11y),
    ...(look ? { look } : {}),
  }
}

/** Huella para comparar dos preferencias sin depender del orden en que se armaron. */
export function preferencesKey(p: UiPreferences): string {
  const s = toStored(p)
  const a11y = Object.fromEntries(Object.entries(s.a11y).sort(([a], [b]) => a.localeCompare(b)))
  return JSON.stringify([s.theme, s.contrast, s.accent, a11y, p.look ? lookToStored(p.look) : null])
}
