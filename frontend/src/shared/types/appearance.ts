import type { Accent } from '@/shared/domain/appearance'
import type { BrandId } from '@/shared/types/brands'

/** Textos de apariencia y accesibilidad. Colores principales que se pueden elegir: nombre en pantalla y muestra (única fuente). */
export const ACCENT_LABEL = 'Color principal'

export const ACCENTS: Record<Exclude<Accent, 'brand'>, { name: string; swatch: string }> = {
  green: { name: 'Verde', swatch: '#15803d' },
  violet: { name: 'Violeta', swatch: '#6d28d9' },
  orange: { name: 'Naranja', swatch: '#c2410c' },
  teal: { name: 'Turquesa', swatch: '#0f766e' },
}

/** «brand»: el color de la marca activa. */
export const BRAND_ACCENT: Record<BrandId, { name: string; swatch: string }> = {
  noraves: { name: 'Azul (marca)', swatch: '#1557c0' },
  rocio: { name: 'Rojo (marca)', swatch: '#c41e15' },
}

/** Botón de accesibilidad y Perfil → Apariencia. */
export const A11Y_LABEL = 'Accesibilidad'
export const HIGH_CONTRAST_LABEL = 'Alto contraste'
export const HIGH_CONTRAST_HINT = 'Letra más grande, más contraste y bordes marcados. Útil a pleno sol.'

/** Opciones del botón de accesibilidad: título y ayuda breve (única fuente). */
export const A11Y_TEXT_SIZE_LABEL = 'Tamaño del texto'
export const A11Y_TEXT_SIZES = [
  { value: 'normal', label: 'A', name: 'Normal' },
  { value: 'large', label: 'A+', name: 'Grande' },
  { value: 'xlarge', label: 'A++', name: 'Muy grande' },
] as const
export const A11Y_OPTIONS = {
  reduceMotion: { title: 'Reducir animaciones', hint: 'Sin movimientos ni transiciones.' },
  underlineLinks: { title: 'Subrayar enlaces', hint: 'Los enlaces se reconocen sin depender del color.' },
  textSpacing: { title: 'Espaciado de texto', hint: 'Más aire entre letras, palabras y líneas.' },
  readableFont: { title: 'Letra más legible', hint: 'Una fuente más abierta y fácil de leer.' },
  strongFocus: { title: 'Foco resaltado', hint: 'Marca bien dónde estás al usar el teclado.' },
  hideImages: { title: 'Ocultar imágenes', hint: 'Quita fotos, ilustraciones y adornos.' },
  readAloud: { title: 'Lector de pantalla', hint: 'Lee en voz alta lo que tocas o enfocas con el teclado.' },
} as const
export const A11Y_RESET_LABEL = 'Restablecer todo'
export const A11Y_READER_ON = 'Lector activado. Toca cualquier texto o botón para escucharlo.'
export const A11Y_READER_UNAVAILABLE = 'Este navegador no puede leer en voz alta.'
