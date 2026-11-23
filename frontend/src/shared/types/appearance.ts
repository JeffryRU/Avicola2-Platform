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

/** Panel de apariencia (botón de la paleta): temas, figuras de fondo y tema propio. */
export const LOOK_TEXT = {
  panel: 'Apariencia',
  panelHint: 'Se guarda en tu cuenta: lo verás igual en cualquier equipo.',
  themes: 'Temas prediseñados',
  noThemes: 'Aún no tienes temas propios. Con «Personalizar» armas uno con tus colores y figuras.',
  primary: 'Color principal',
  primaryHint: (theme: string) =>
    `Combina con el tema «${theme}». Se usa en botones, enlaces, cabeceras de tablas y avisos.`,
  otherColor: 'Otro color',
  yourColor: 'Tu color',
  myThemes: 'Mis temas',
  customize: 'Personalizar',
  editTheme: 'Editar tema',
  deleteTheme: 'Borrar tema',
  patterns: 'Figuras de fondo',
  page: 'En la pantalla',
  menu: 'En el menú',
  size: 'Tamaño',
  smaller: 'Más pequeñas',
  bigger: 'Más grandes',
  editorTitle: 'Tema propio',
  name: 'Nombre',
  defaultName: 'Mi tema',
  menuColor: 'Color del menú',
  topbarColor: 'Color de la franja de arriba',
  shape: 'Forma',
  shapeSoft: 'Redondeada (MVP)',
  shapeCrisp: 'Recta, con bordes finos',
  activeColor: 'Color de lo seleccionado',
  backgroundColor: 'Color del fondo',
  pagePattern: 'Figuras de la pantalla',
  menuPattern: 'Figuras del menú',
  figureColor: 'Color de las figuras',
  save: 'Guardar tema',
  cancel: 'Cancelar',
  saved: 'Tema guardado',
  limit: 'Puedes guardar hasta 8 temas: borra uno para guardar otro.',
  hcNote: 'En alto contraste los colores y las figuras no se aplican.',
  preview: 'Vista previa',
  icons: 'Íconos de la figura',
  iconsHint: 'Elige hasta 4: se reparten por el fondo.',
  iconsPick: 'Arma la figura con tus íconos',
} as const

/** Nombre en pantalla de cada figura de fondo. */
export const PATTERN_NAMES = {
  none: 'Sin figuras',
  dashes: 'Rayitas',
  lines: 'Rayas',
  dots: 'Puntos',
  grid: 'Cuadrícula',
  waves: 'Ondas',
  plus: 'Cruces',
  grains: 'Granos',
  eggs: 'Huevos',
  icons: 'Íconos',
} as const

/** Descripción breve de los temas predefinidos. */
export const PRESET_HINTS = {
  clasico: 'Blanco y azul, redondeado (MVP 1 y 2)',
  marca: 'Menú del color principal',
  blanco: 'Claro y minimalista',
  campo: 'Verde y amarillo',
  grafito: 'Gris oscuro y menta',
  ciruela: 'Morado y durazno',
  cielo: 'Azul claro y amarillo',
} as const

/** Selector de color (ventana centrada). */
export const COLOR_PICKER_TEXT = {
  hint: 'Mueve el punto o escribe el código del color.',
  code: 'Código del color',
  suggested: 'Sugeridos',
  cancel: 'Cancelar',
  use: 'Usar color',
  choose: 'Elegir color',
} as const

/** Colores de las series de un gráfico (botón «Colores»). */
export const CHART_COLORS_TEXT = {
  button: 'Colores',
  title: 'Colores del gráfico',
  hint: 'Cambia el color y el trazo de cada línea. Se guarda en tu cuenta y vale para todos los gráficos.',
  hintFill: 'Cambia el color de las barras. Se guarda en tu cuenta y vale para todos los gráficos.',
  change: 'Cambiar color',
  reset: 'Volver a los colores de siempre',
  hcNote: 'En alto contraste se usan los colores del sistema.',
  lineStyle: 'Trazo',
} as const

/** Nombre de cada trazo de línea. */
export const LINE_STYLE_NAMES = {
  solid: 'Continua',
  dashed: 'Guiones',
  dotted: 'Puntos',
  dashdot: 'Raya y punto',
  long: 'Raya larga',
} as const

/** Nombre de cada serie de los gráficos (Perfil → Apariencia: colores de los gráficos). */
export const CHART_SERIES_NAMES = {
  'chart-1': 'Proyección vigente',
  'chart-2': 'Pedido real (ERP)',
  'chart-model': 'Modelo (sugerencia)',
  'chart-prev-1': 'Proyección 1 (anterior)',
  'chart-prev-2': 'Proyección 2 (anterior)',
  'chart-prev-3': 'Proyección 3 (anterior)',
  'chart-part-1': 'Franja 1 (p. ej. Brasa chica)',
  'chart-part-2': 'Franja 2 (p. ej. Brasa mediana)',
  'chart-part-3': 'Franja 3 (p. ej. Brasa grande)',
  'chart-part-4': 'Franja 4 (p. ej. Pollo entero)',
} as const
export const CHART_STYLES_TITLE = 'Colores de los gráficos'
export const CHART_STYLES_HINT = 'Color y trazo de cada línea. También desde el botón «Colores» de cada gráfico.'
