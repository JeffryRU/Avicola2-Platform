/**
 * Opciones de accesibilidad (botón de accesibilidad). TypeScript puro.
 * Cada opción es un atributo en <html> que globals.css interpreta. La misma regla corre antes del
 * primer pintado en public/appearance-boot.js; `unit-tests/accessibility.test.ts` comprueba que
 * ambas digan lo mismo.
 */

export const TEXT_SIZES = ['normal', 'large', 'xlarge'] as const
export type TextSize = (typeof TEXT_SIZES)[number]

export interface A11yPreference {
  /** Tamaño de toda la letra (escala el rem). */
  textSize: TextSize
  /** Quita animaciones y transiciones aunque el sistema no lo pida. */
  reduceMotion: boolean
  /** Subraya todos los enlaces (no depender solo del color). */
  underlineLinks: boolean
  /** Más espacio entre letras, palabras y líneas (WCAG 1.4.12). */
  textSpacing: boolean
  /** Letra de sistema más abierta y fácil de leer. */
  readableFont: boolean
  /** Contorno de foco grueso y con halo, para quien navega con teclado. */
  strongFocus: boolean
  /** Oculta fotos, ilustraciones y adornos (menos distracción, menos datos). */
  hideImages: boolean
  /** Lector: lee en voz alta lo que se toca o se enfoca con el teclado. */
  readAloud: boolean
}

export const DEFAULT_A11Y: A11yPreference = {
  textSize: 'normal',
  reduceMotion: false,
  underlineLinks: false,
  textSpacing: false,
  readableFont: false,
  strongFocus: false,
  hideImages: false,
  readAloud: false,
}

/** Clave en el almacén de preferencias (KeyValueStore guarda JSON). */
export const A11Y_KEY = 'nv_a11y'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Lo guardado → preferencia válida: cada campo raro o ausente vuelve a su valor por defecto. */
export function sanitizeA11y(raw: unknown): A11yPreference {
  const o = isObject(raw) ? raw : {}
  const flag = (k: keyof A11yPreference) => (typeof o[k] === 'boolean' ? (o[k]) : false)
  return {
    textSize: TEXT_SIZES.includes(o.textSize as TextSize) ? (o.textSize as TextSize) : 'normal',
    reduceMotion: flag('reduceMotion'),
    underlineLinks: flag('underlineLinks'),
    textSpacing: flag('textSpacing'),
    readableFont: flag('readableFont'),
    strongFocus: flag('strongFocus'),
    hideImages: flag('hideImages'),
    readAloud: flag('readAloud'),
  }
}

/** Atributos de <html> para globals.css. */
export function a11yAttributes(p: A11yPreference): Record<string, string> {
  return {
    'data-text-size': p.textSize,
    'data-motion': p.reduceMotion ? 'reduce' : 'normal',
    'data-links': p.underlineLinks ? 'underline' : 'normal',
    'data-spacing': p.textSpacing ? 'wide' : 'normal',
    'data-font': p.readableFont ? 'readable' : 'normal',
    'data-focus': p.strongFocus ? 'strong' : 'normal',
    'data-images': p.hideImages ? 'hidden' : 'shown',
    'data-reader': p.readAloud ? 'on' : 'off',
  }
}

/** Cuántas opciones se apartan de lo normal (para marcar el botón). */
export function activeA11yCount(p: A11yPreference): number {
  return (
    Number(p.textSize !== 'normal') +
    Number(p.reduceMotion) +
    Number(p.underlineLinks) +
    Number(p.textSpacing) +
    Number(p.readableFont) +
    Number(p.strongFocus) +
    Number(p.hideImages) +
    Number(p.readAloud)
  )
}
