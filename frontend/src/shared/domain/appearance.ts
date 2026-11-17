/**
 * Apariencia: tema (claro/oscuro) y alto contraste. TypeScript puro.
 * La misma regla corre antes del primer pintado en index.html (script en línea, sin React);
 * `unit-tests/appearance.test.ts` comprueba que ambas digan lo mismo.
 */

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]

/** Alto contraste: `system` sigue a `prefers-contrast: more`; las otras son elección del usuario. */
export const CONTRAST_PREFERENCES = ['system', 'normal', 'high'] as const
export type ContrastPreference = (typeof CONTRAST_PREFERENCES)[number]

/** Color principal: `brand` es el de la marca (azul Noraves, rojo Rocío); los demás, a elección. */
export const ACCENT_IDS = ['brand', 'green', 'violet', 'orange', 'teal'] as const
export type Accent = (typeof ACCENT_IDS)[number]

export type Theme = 'light' | 'dark'
export type Contrast = 'normal' | 'high'

export interface AppearancePreference {
  theme: ThemePreference
  contrast: ContrastPreference
  accent: Accent
}

/** Lo que pide el sistema operativo (media queries). */
export interface SystemAppearance {
  prefersDark: boolean
  prefersMoreContrast: boolean
}

export interface ResolvedAppearance {
  theme: Theme
  contrast: Contrast
  accent: Accent
}

/** Claro por defecto: el oscuro se elige con el botón sol/luna o en Perfil → Apariencia. */
export const DEFAULT_APPEARANCE: AppearancePreference = { theme: 'light', contrast: 'system', accent: 'brand' }

/** Claves en el almacén de preferencias (KeyValueStore guarda JSON). */
/** `nv_theme_mode` (antes `nv_theme`): la clave nueva hace que todos empiecen en claro. */
export const THEME_KEY = 'nv_theme_mode'
export const CONTRAST_KEY = 'nv_contrast'
export const ACCENT_KEY = 'nv_accent'

/** Media queries que se escuchan para seguir al sistema. */
export const DARK_QUERY = '(prefers-color-scheme: dark)'
export const MORE_CONTRAST_QUERY = '(prefers-contrast: more)'

/** Tema y contraste efectivos: la elección del usuario manda; si no eligió, el sistema. */
export function resolveAppearance(pref: AppearancePreference, system: SystemAppearance): ResolvedAppearance {
  const theme: Theme = pref.theme === 'system' ? (system.prefersDark ? 'dark' : 'light') : pref.theme
  const contrast: Contrast =
    pref.contrast === 'system' ? (system.prefersMoreContrast ? 'high' : 'normal') : pref.contrast
  return { theme, contrast, accent: pref.accent }
}

/**
 * Valor que se guarda al mover el interruptor de alto contraste. Si coincide con lo que pide
 * el sistema, se vuelve a «seguir al sistema»: así un cambio posterior del sistema se respeta.
 */
export function contrastFromSwitch(on: boolean, system: SystemAppearance): ContrastPreference {
  return on === system.prefersMoreContrast ? 'system' : on ? 'high' : 'normal'
}

/**
 * Color de la barra del navegador (meta theme-color): el de la barra superior de la app.
 * En alto contraste es la barra de la marca (navy de Noraves o el oscuro de Rocío).
 */
/** Barra de alto contraste con un color principal elegido (igual que --head en globals.css). */
const HC_ACCENT_HEAD: Record<Exclude<Accent, 'brand'>, string> = {
  green: '#0f3d24',
  violet: '#2e1065',
  orange: '#431407',
  teal: '#0b3b38',
}

export function themeColor(resolved: ResolvedAppearance, brand: string): string {
  if (resolved.contrast === 'high') {
    if (resolved.accent !== 'brand') return HC_ACCENT_HEAD[resolved.accent]
    return brand === 'rocio' ? '#1f1d1b' : '#0b2c61'
  }
  return resolved.theme === 'dark' ? '#14171b' : '#fbfbf9'
}
