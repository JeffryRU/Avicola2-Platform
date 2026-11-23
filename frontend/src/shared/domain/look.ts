/**
 * Estilo de la app: tema (color del menú, del ítem seleccionado, del fondo y color principal) y
 * las figuras de fondo del menú y de la pantalla, cada una con su color y tamaño. Se guarda en
 * este equipo y en la cuenta (preferences.ts), junto con los temas propios.
 * TypeScript puro: arma las variables `--look-*` que globals.css usa con su valor por defecto.
 * Alto contraste las ignora (sus reglas ponen los colores directamente).
 */

import { PATTERN_ICON_IDS, iconById } from '@/shared/domain/pattern-icons'

/** Figuras de fondo: mosaicos de 160 px dibujados en una sola línea de color (`icons`: íconos elegidos). */
export const PATTERN_IDS = [
  'none',
  'dashes',
  'lines',
  'dots',
  'grid',
  'waves',
  'plus',
  'grains',
  'eggs',
  'icons',
] as const
export type PatternId = (typeof PATTERN_IDS)[number]

/**
 * Color de una zona: `#rrggbb`, `brand` (el de la marca y el color principal) o `surface`
 * (blanco minimalista, como era antes).
 */
export type ColorRef = string

export interface Look {
  /** Color principal (botones, enlaces, cabeceras de tabla, avisos): `brand` o `#rrggbb`. */
  primary: ColorRef
  menu: ColorRef
  active: ColorRef
  background: ColorRef
  pagePattern: PatternId
  pageColor: string
  menuPattern: PatternId
  menuColor: string
  /** Íconos de la figura `icons` (hasta MAX_ICONS). */
  pageIcons: string[]
  menuIcons: string[]
  /** Franja de arriba (cuenta, apariencia): `surface` (la de las tarjetas) o `#rrggbb`. */
  topbar: ColorRef
  /**
   * Forma: `soft` (la del MVP 1 y 2: esquinas redondeadas, tarjetas sin borde con sombra suave
   * y letra Plus Jakarta Sans) o `crisp` (bordes finos y esquinas justas).
   */
  shape: Shape
}

export const SHAPES = ['soft', 'crisp'] as const
export type Shape = (typeof SHAPES)[number]

/**
 * Tipos de letra que puede elegir cada persona (aparte del tema). `theme`: la del tema (Plus
 * Jakarta Sans con la forma «soft», IBM Plex Sans con «crisp»). Los archivos los carga globals.css.
 */
const FALLBACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
export const FONTS = {
  theme: { name: 'La del tema', family: '' },
  jakarta: { name: 'Plus Jakarta Sans (MVP 1 y 2)', family: `'Plus Jakarta Sans', ${FALLBACK}` },
  plex: { name: 'IBM Plex Sans', family: `'IBM Plex Sans', ${FALLBACK}` },
  public: { name: 'Public Sans', family: `'Public Sans', ${FALLBACK}` },
  inter: { name: 'Inter', family: `'Inter', ${FALLBACK}` },
  nunito: { name: 'Nunito (redondeada)', family: `'Nunito', ${FALLBACK}` },
  montserrat: { name: 'Montserrat', family: `'Montserrat', ${FALLBACK}` },
  lexend: { name: 'Lexend (lectura fácil)', family: `'Lexend', ${FALLBACK}` },
  source: { name: 'Source Sans 3', family: `'Source Sans 3', ${FALLBACK}` },
  atkinson: { name: 'Atkinson Hyperlegible', family: `'Atkinson Hyperlegible', ${FALLBACK}` },
} as const
export type FontId = keyof typeof FONTS
export const FONT_IDS = Object.keys(FONTS) as FontId[]
const isFontId = (v: unknown): v is FontId => typeof v === 'string' && v in FONTS

export interface SavedLook extends Look {
  id: string
  name: string
}

/** Figuras de una zona: si se ven y su tamaño (1 = normal). */
export interface PatternSetting {
  show: boolean
  size: number
}

export interface LookPreference {
  /** Tema elegido: un predefinido o uno guardado por el usuario. */
  theme: string
  saved: SavedLook[]
  page: PatternSetting
  menu: PatternSetting
  /** Color principal elegido para cada tema (si no hay, el del tema). */
  primaries: Record<string, string>
  /** Secciones del panel abiertas (se recuerda cómo se dejó). */
  open: { presets: boolean; mine: boolean }
  /** Colores propios de las series de los gráficos (variable CSS → `#rrggbb`). */
  chart: Partial<Record<ChartKey, string>>
  /** Trazo propio de cada línea de los gráficos. */
  chartDash: Partial<Record<LineKey, LineStyle>>
  /** Tipo de letra elegido (vale con cualquier tema). */
  font: FontId
}

/** Líneas cuyo trazo se puede cambiar (las franjas no tienen trazo). */
export const LINE_KEYS = ['chart-1', 'chart-2', 'chart-model', 'chart-prev-1', 'chart-prev-2', 'chart-prev-3'] as const
export type LineKey = (typeof LINE_KEYS)[number]
export const isLineKey = (k: string): k is LineKey => (LINE_KEYS as readonly string[]).includes(k)

/** Trazos de línea: valor de `stroke-dasharray`. */
export const LINE_STYLES = {
  solid: 'none',
  dashed: '6 4',
  dotted: '1.5 4',
  dashdot: '8 3 1.5 3',
  long: '12 5',
} as const
export type LineStyle = keyof typeof LINE_STYLES
/** Trazo de siempre de cada línea (el mismo que pone globals.css). */
export const DEFAULT_LINE_STYLE: Record<LineKey, LineStyle> = {
  'chart-1': 'solid',
  'chart-2': 'dashed',
  'chart-model': 'long',
  'chart-prev-1': 'dotted',
  'chart-prev-2': 'dashdot',
  'chart-prev-3': 'long',
}
const isLineStyle = (v: unknown): v is LineStyle => typeof v === 'string' && v in LINE_STYLES

/** Series de los gráficos cuyo color se puede cambiar (son variables de globals.css). */
export const CHART_KEYS = [
  'chart-1',
  'chart-2',
  'chart-model',
  'chart-prev-1',
  'chart-prev-2',
  'chart-prev-3',
  'chart-part-1',
  'chart-part-2',
  'chart-part-3',
  'chart-part-4',
] as const
export type ChartKey = (typeof CHART_KEYS)[number]
const isChartKey = (k: string): k is ChartKey => (CHART_KEYS as readonly string[]).includes(k)

/** Íconos por figura: entran juntos en un texto de 40 letras de la cuenta. */
export const MAX_ICONS = 4
const DEFAULT_ICONS = ['egg', 'wheat', 'feather']

export const PRESET_IDS = ['clasico', 'marca', 'blanco', 'campo', 'grafito', 'ciruela', 'cielo'] as const
export type PresetId = (typeof PRESET_IDS)[number]

export const PRESETS: Record<PresetId, Look & { name: string }> = {
  // El de la primera y segunda versión (MVP 1 y 2): blanco y azul vivo, esquinas redondeadas.
  clasico: {
    name: 'Clásico (MVP)',
    primary: '#1570ef',
    menu: '#ffffff',
    active: '#1570ef',
    background: '#f0f5fc',
    pagePattern: 'none',
    pageColor: '#0b2c61',
    menuPattern: 'none',
    menuColor: '#0b2c61',
    pageIcons: DEFAULT_ICONS,
    menuIcons: DEFAULT_ICONS,
    topbar: '#ffffff',
    shape: 'soft',
  },
  marca: {
    name: 'Marca',
    primary: 'brand',
    menu: 'brand',
    active: 'brand',
    background: 'brand',
    pagePattern: 'dashes',
    pageColor: '#14233d',
    menuPattern: 'lines',
    menuColor: '#ffffff',
    pageIcons: DEFAULT_ICONS,
    menuIcons: DEFAULT_ICONS,
    topbar: 'surface',
    shape: 'crisp',
  },
  blanco: {
    name: 'Blanco',
    primary: 'brand',
    menu: 'surface',
    active: 'surface',
    background: 'surface',
    pagePattern: 'dots',
    pageColor: '#8a8270',
    menuPattern: 'lines',
    menuColor: '#8a8270',
    pageIcons: DEFAULT_ICONS,
    menuIcons: DEFAULT_ICONS,
    topbar: 'surface',
    shape: 'crisp',
  },
  campo: {
    name: 'Campo',
    primary: '#1f6b3a',
    menu: '#1e4d33',
    active: '#f4c542',
    background: '#edf3ea',
    pagePattern: 'grains',
    pageColor: '#1e4d33',
    menuPattern: 'dots',
    menuColor: '#ffffff',
    pageIcons: DEFAULT_ICONS,
    menuIcons: DEFAULT_ICONS,
    topbar: 'surface',
    shape: 'crisp',
  },
  grafito: {
    name: 'Grafito',
    primary: '#1f5f5b',
    menu: '#262a31',
    active: '#6fd3c1',
    background: '#eff0f2',
    pagePattern: 'grid',
    pageColor: '#262a31',
    menuPattern: 'plus',
    menuColor: '#ffffff',
    pageIcons: DEFAULT_ICONS,
    menuIcons: DEFAULT_ICONS,
    topbar: 'surface',
    shape: 'crisp',
  },
  ciruela: {
    name: 'Ciruela',
    primary: '#6b2a70',
    menu: '#4b1f4f',
    active: '#ffb59e',
    background: '#f6eff4',
    pagePattern: 'waves',
    pageColor: '#4b1f4f',
    menuPattern: 'eggs',
    menuColor: '#ffffff',
    pageIcons: DEFAULT_ICONS,
    menuIcons: DEFAULT_ICONS,
    topbar: 'surface',
    shape: 'crisp',
  },
  cielo: {
    name: 'Cielo',
    primary: '#0f5fa3',
    menu: '#0f62a8',
    active: '#ffd54a',
    background: '#eaf3fb',
    pagePattern: 'eggs',
    pageColor: '#0f62a8',
    menuPattern: 'waves',
    menuColor: '#ffffff',
    pageIcons: DEFAULT_ICONS,
    menuIcons: DEFAULT_ICONS,
    topbar: 'surface',
    shape: 'crisp',
  },
}

export const PATTERN_SIZE = { min: 0.5, max: 2, step: 0.25 } as const
export const MAX_SAVED_LOOKS = 8

/** Por defecto, el clásico del MVP 1 y 2; el azul de la marca queda como un tema más. */
export const DEFAULT_LOOK: LookPreference = {
  theme: 'clasico',
  saved: [],
  page: { show: true, size: 1 },
  menu: { show: true, size: 1 },
  primaries: {},
  open: { presets: true, mine: true },
  chart: {},
  chartDash: {},
  font: 'theme',
}

/** Claves en el almacén del equipo. `nv_look_vars` lo lee public/appearance-boot.js (sin parpadeo). */
export const LOOK_KEY = 'nv_look'
export const LOOK_VARS_KEY = 'nv_look_vars'

const HEX = /^#[0-9a-f]{6}$/i
export const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v)

/** Luminancia relativa (WCAG) de `#rrggbb`: 0 negro, 1 blanco. */
export function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Texto que se lee sobre un color: tinta oscura o blanco (el de mayor contraste). */
export const readableOn = (hex: string) => {
  const l = luminance(hex)
  return (l + 0.05) / 0.0617 >= 1.05 / (l + 0.05) ? '#14233d' : '#ffffff'
}
const isLight = (hex: string) => readableOn(hex) !== '#ffffff'

/** Color principal efectivo del tema elegido. */
export function primaryOf(pref: LookPreference): ColorRef {
  return pref.primaries[pref.theme] ?? lookOf(pref).primary
}

// --- Colores (HSL) -------------------------------------------------------------------------

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, sat, l]
}

function fromHsl(h: number, sat: number, l: number): string {
  const hue = ((h % 360) + 360) % 360
  const f = (n: number) => {
    const k = (n + hue / 30) % 12
    const c = l - sat * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Oscurece el color hasta que el texto blanco encima pase 4,5:1 (botones). */
export function readablePrimary(hex: string): string {
  const [h, sat, l0] = toHsl(hex)
  let l = l0
  let out = hex
  while (luminance(out) > 0.183 && l > 0.05) {
    l -= 0.03
    out = fromHsl(h, sat, l)
  }
  return out
}

const HUE_NAMES: [number, string][] = [
  [15, 'Rojo'],
  [40, 'Naranja'],
  [65, 'Mostaza'],
  [165, 'Verde'],
  [200, 'Turquesa'],
  [250, 'Azul'],
  [312, 'Morado'],
  [345, 'Fucsia'],
  [360, 'Rojo'],
]
const hueName = (h: number, sat: number) => {
  if (sat < 0.12) return 'Gris'
  const hue = ((h % 360) + 360) % 360
  return (HUE_NAMES.find(([max]) => hue <= max) ?? HUE_NAMES[0])[1]
}

export interface PrimaryOption {
  /** Valor que se guarda (`brand` o `#rrggbb`). */
  value: ColorRef
  /** Color que se muestra. */
  swatch: string
  name: string
}

/**
 * Colores principales que combinan con el tema: el del tema y tonos oscuros de su mismo color y
 * de los vecinos (con un morado: morado oscuro, ciruela oscuro, azul oscuro…). Todos pasan
 * contraste con texto blanco. `brandHex` es el color de la marca (para «brand»).
 */
export function primaryOptions(look: Look, brandHex: string): PrimaryOption[] {
  const own = isHex(look.primary) ? look.primary : brandHex
  const base = isHex(look.menu) && toHsl(look.menu)[1] > 0.12 ? look.menu : own
  const [h, s0] = toHsl(base)
  const sat = Math.min(0.75, Math.max(0.45, s0))
  const make = (hue: number, l: number, suffix: string): PrimaryOption => {
    const hex = readablePrimary(fromHsl(hue, sat, l))
    return { value: hex, swatch: hex, name: `${hueName(hue, sat)} ${suffix}`.trim() }
  }
  const slate = readablePrimary(fromHsl(h, 0.22, 0.3))
  const list: PrimaryOption[] = [
    { value: look.primary, swatch: own, name: 'Del tema' },
    make(h, 0.24, 'oscuro'),
    make(h, 0.4, ''),
    make(h - 50, 0.3, 'oscuro'),
    make(h + 50, 0.3, 'oscuro'),
    // Un gris del mismo tono, para quien prefiere algo sobrio.
    { value: slate, swatch: slate, name: 'Pizarra' },
  ]
  const seen = new Set<string>()
  return list.filter((o) => {
    const keys = [o.swatch.toLowerCase(), o.name]
    if (keys.some((k) => seen.has(k))) return false
    keys.forEach((k) => seen.add(k))
    return true
  })
}

/** El tema elegido (predefinido o guardado); si ya no existe, «Marca». */
export function lookOf(pref: LookPreference): Look {
  if ((PRESET_IDS as readonly string[]).includes(pref.theme)) return PRESETS[pref.theme as PresetId]
  return pref.saved.find((s) => s.id === pref.theme) ?? PRESETS.clasico
}

// --- Figuras -------------------------------------------------------------------------------

/** Dibujo de cada figura en un mosaico de 160 px (`S` = trazo, `F` = relleno). */
const TILES: Record<Exclude<PatternId, 'none' | 'icons'>, string> = {
  // Rayitas sueltas en distintos ángulos.
  dashes: [
    [22, 26, 30],
    [70, 18, -40],
    [122, 34, 70],
    [44, 72, -15],
    [96, 66, 50],
    [140, 92, -60],
    [20, 118, 80],
    [64, 128, 20],
    [112, 136, -30],
  ]
    .map(([x, y, a]) => `<path S transform='translate(${x} ${y}) rotate(${a})' d='M-7 0h14' stroke-width='2.2'/>`)
    .join(''),
  // Rayas diagonales.
  lines: Array.from({ length: 11 }, (_, i) => `<path S d='M${i * 32} 0L${i * 32 - 160} 160' stroke-width='1.5'/>`).join(
    '',
  ),
  // Puntos en rejilla escalonada.
  dots: Array.from({ length: 16 }, (_, i) => {
    const x = (i % 4) * 40 + (Math.floor(i / 4) % 2) * 20 + 10
    const y = Math.floor(i / 4) * 40 + 10
    return `<circle F cx='${x}' cy='${y}' r='2.2'/>`
  }).join(''),
  // Cuadrícula fina.
  grid: Array.from(
    { length: 4 },
    (_, i) => `<path S d='M${i * 40 + 0.5} 0v160M0 ${i * 40 + 0.5}h160' stroke-width='1'/>`,
  ).join(''),
  // Ondas horizontales.
  waves: Array.from(
    { length: 5 },
    (_, i) => `<path S d='M0 ${i * 32 + 16}q20 -9 40 0t40 0t40 0t40 0' stroke-width='1.6'/>`,
  ).join(''),
  // Cruces pequeñas.
  plus: [
    [20, 20],
    [100, 20],
    [60, 60],
    [140, 60],
    [20, 100],
    [100, 100],
    [60, 140],
    [140, 140],
  ]
    .map(([x, y]) => `<path S d='M${x - 5} ${y}h10M${x} ${y - 5}v10' stroke-width='1.8'/>`)
    .join(''),
  // Granos de maíz (óvalos rellenos).
  grains: [
    [24, 22, 20],
    [86, 30, -35],
    [138, 18, 60],
    [52, 70, -10],
    [118, 78, 40],
    [20, 116, -50],
    [76, 124, 15],
    [134, 136, -25],
  ]
    .map(([x, y, a]) => `<ellipse F transform='translate(${x} ${y}) rotate(${a})' rx='3.2' ry='5'/>`)
    .join(''),
  // Huevos en línea fina.
  eggs: [
    [34, 36, -14, 0.16],
    [116, 104, 18, 0.13],
  ]
    .map(
      ([x, y, a, s]) =>
        `<path S transform='translate(${x} ${y}) rotate(${a}) scale(${s}) translate(-60 -75)' stroke-width='${(1.4 / s).toFixed(1)}' d='M60 4C30 4 6 58 6 94c0 30 24 52 54 52s54-22 54-52C114 58 90 4 60 4Z'/>`,
    )
    .join(''),
}

/** Peso de cada figura: las que llenan más (cuadrícula, rayas) van más tenues para no cansar. */
const WEIGHT: Record<Exclude<PatternId, 'none'>, number> = {
  dashes: 1,
  lines: 0.6,
  dots: 1,
  grid: 0.55,
  waves: 0.75,
  plus: 1,
  grains: 0.85,
  eggs: 1.1,
  icons: 0.95,
}

/** Lugares (x, y, giro) de los íconos en el mosaico; se reparten los elegidos por turno. */
const ICON_SPOTS = [
  [30, 30, -12],
  [104, 22, 14],
  [66, 80, 6],
  [140, 92, -18],
  [26, 132, 16],
  [102, 138, -6],
]

function iconsTile(icons: string[]): string {
  const bodies = icons.map((i) => iconById(i)?.body).filter((b): b is string => Boolean(b))
  if (!bodies.length) return ''
  return ICON_SPOTS.map(
    ([x, y, a], i) =>
      `<g S stroke-width='1.8' stroke-linejoin='round' transform='translate(${x} ${y}) rotate(${a}) scale(0.9) translate(-12 -12)'>${bodies[i % bodies.length]}</g>`,
  ).join('')
}

/** `url(...)` con el mosaico de la figura en ese color y opacidad (o `none`). */
export function patternUrl(id: PatternId, color: string, opacity: number, icons: string[] = DEFAULT_ICONS): string {
  if (id === 'none') return 'none'
  opacity = Math.round(opacity * WEIGHT[id] * 100) / 100
  const stroke = `fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-linecap='round'`
  const fill = `fill='${color}' fill-opacity='${opacity}'`
  const body = (id === 'icons' ? iconsTile(icons) : TILES[id])
    .replaceAll(' S ', ` ${stroke} `)
    .replaceAll(' F ', ` ${fill} `)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>${body}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

// --- Variables CSS -------------------------------------------------------------------------

const INK = '#14233d'
const ON_DARK = {
  muted: 'rgb(255 255 255 / 0.8)',
  hover: 'rgb(255 255 255 / 0.1)',
  border: 'rgb(255 255 255 / 0.14)',
}
const ON_LIGHT = { muted: '#3a4558', hover: 'rgb(20 35 61 / 0.07)', border: 'rgb(20 35 61 / 0.12)' }
/** Fondo de antes (claro, casi blanco). */
const PLAIN_BACKGROUND = '#f6f6f3'
/** Tinte de bordes y grises del tema blanco (cálido, como era antes). */
const WARM_GREY = '#8a8270'

/**
 * Variables `--look-*` del estilo para el tema efectivo. Lo que no se pone toma el valor por
 * defecto de globals.css (la marca). En oscuro el fondo no cambia y un menú claro pasa a la
 * superficie oscura, para que el texto siga leyéndose.
 */
export function lookVars(pref: LookPreference, theme: 'light' | 'dark'): Record<string, string> {
  const look = lookOf(pref)
  const v: Record<string, string> = {}
  const dark = theme === 'dark'

  // Menú
  let menuIsLight = false
  if (look.menu === 'surface' || (isHex(look.menu) && dark && isLight(look.menu))) {
    menuIsLight = !dark
    Object.assign(v, {
      '--look-chrome': 'var(--side)',
      '--look-chrome-fg': 'var(--foreground)',
      '--look-chrome-muted': 'var(--ink-2)',
      '--look-chrome-hover': 'var(--muted)',
      '--look-chrome-border': 'var(--border)',
      '--look-chrome-edge': 'var(--border)',
    })
    // Bordes y grises cálidos, como era antes.
    if (look.menu === 'surface') v['--look-tint'] = WARM_GREY
  } else if (isHex(look.menu)) {
    menuIsLight = isLight(look.menu)
    const on = menuIsLight ? ON_LIGHT : ON_DARK
    Object.assign(v, {
      '--look-chrome': look.menu,
      '--look-chrome-fg': readableOn(look.menu),
      '--look-chrome-muted': on.muted,
      '--look-chrome-hover': on.hover,
      '--look-chrome-border': on.border,
    })
    // Un menú casi blanco no tiñe: los bordes toman el color principal (como en el MVP).
    v['--look-tint'] = luminance(look.menu) > 0.8 ? (isHex(look.primary) ? look.primary : 'var(--primary)') : look.menu
  }

  // Ítem seleccionado
  if (look.active === 'surface') {
    v['--look-active'] = 'var(--nav-active)'
    v['--look-active-fg'] = 'var(--nav-active-foreground)'
  } else if (isHex(look.active)) {
    v['--look-active'] = look.active
    v['--look-active-fg'] = readableOn(look.active)
  }

  // Fondo (solo en claro; uno muy oscuro se aclara para que el texto se lea)
  if (!dark) {
    if (look.background === 'surface') v['--look-bg'] = PLAIN_BACKGROUND
    else if (isHex(look.background))
      v['--look-bg'] = isLight(look.background)
        ? look.background
        : `color-mix(in oklab, ${look.background} 18%, #ffffff)`
  }

  // Franja de arriba: su color y un texto que se lea (en oscuro, una clara pasa a la superficie).
  if (isHex(look.topbar) && !(dark && isLight(look.topbar))) {
    const light = isLight(look.topbar)
    Object.assign(v, {
      '--look-topbar': look.topbar,
      '--look-topbar-fg': readableOn(look.topbar),
      '--look-topbar-muted': light ? ON_LIGHT.muted : ON_DARK.muted,
      '--look-topbar-border': light ? 'var(--border)' : ON_DARK.border,
      '--look-topbar-hover': light ? ON_LIGHT.hover : ON_DARK.hover,
    })
  }
  // Forma (la lee el proveedor para poner data-shape en <html>).
  v['--look-shape'] = look.shape
  // Letra elegida (globals.css la aplica salvo en alto contraste).
  if (pref.font !== 'theme') v['--look-font'] = FONTS[pref.font].family

  // Color principal (globals.css arma sus variantes; en alto contraste no se aplica)
  const primary = primaryOf(pref)
  if (isHex(primary)) v['--look-primary'] = readablePrimary(primary)

  // Figuras
  const pageColor = dark ? '#ffffff' : look.pageColor
  v['--look-page-pattern'] = pref.page.show
    ? patternUrl(look.pagePattern, pageColor, dark ? 0.07 : 0.17, look.pageIcons)
    : 'none'
  // Si la figura casi no se distingue del menú, va en tinta (menú claro) o en blanco (menú oscuro).
  const figure = luminance(look.menuColor)
  const menuColor = menuIsLight ? (figure > 0.6 ? INK : look.menuColor) : figure < 0.08 ? '#ffffff' : look.menuColor
  v['--look-menu-pattern'] = pref.menu.show
    ? patternUrl(look.menuPattern, menuColor, menuIsLight ? 0.12 : 0.13, look.menuIcons)
    : 'none'
  v['--look-page-size'] = `${Math.round(160 * pref.page.size)}px`
  v['--look-menu-size'] = `${Math.round(160 * pref.menu.size)}px`
  return v
}

// --- Saneado -------------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const colorRef = (v: unknown, fallback: ColorRef): ColorRef =>
  v === 'brand' || v === 'surface' || isHex(v) ? v : fallback
const pattern = (v: unknown, fallback: PatternId): PatternId =>
  (PATTERN_IDS as readonly unknown[]).includes(v) ? (v as PatternId) : fallback
const clampSize = (raw: unknown) => {
  const v = typeof raw === 'string' ? Number(raw) : raw
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(PATTERN_SIZE.max, Math.max(PATTERN_SIZE.min, Math.round(v / PATTERN_SIZE.step) * PATTERN_SIZE.step))
    : 1
}
/** Íconos conocidos, sin repetir y hasta MAX_ICONS (acepta lista o texto separado por comas). */
const iconList = (v: unknown): string[] => {
  const raw = typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v : []
  const ids = [...new Set(raw.filter((i): i is string => typeof i === 'string' && PATTERN_ICON_IDS.has(i)))]
  return ids.length ? ids.slice(0, MAX_ICONS) : DEFAULT_ICONS
}
const setting = (v: unknown): PatternSetting => {
  const o = isObject(v) ? v : {}
  return { show: o.show !== false, size: clampSize(o.size) }
}

function sanitizeSaved(v: unknown): SavedLook | null {
  if (!isObject(v) || typeof v.id !== 'string' || !v.id) return null
  // Lo que un tema propio no tenga (temas guardados antes de existir) sale del clásico, salvo
  // la forma: los de antes eran «crisp».
  const base = { ...PRESETS.clasico, shape: 'crisp' as Shape, topbar: 'surface' }
  return {
    id: v.id.slice(0, 40),
    name: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 30) : 'Mi tema',
    primary: colorRef(v.primary, base.primary),
    menu: colorRef(v.menu, base.menu),
    active: colorRef(v.active, base.active),
    background: colorRef(v.background, base.background),
    pagePattern: pattern(v.pagePattern, base.pagePattern),
    pageColor: isHex(v.pageColor) ? v.pageColor : base.pageColor,
    menuPattern: pattern(v.menuPattern, base.menuPattern),
    menuColor: isHex(v.menuColor) ? v.menuColor : base.menuColor,
    pageIcons: iconList(v.pageIcons),
    menuIcons: iconList(v.menuIcons),
    topbar: v.topbar === 'surface' || isHex(v.topbar) ? v.topbar : base.topbar,
    shape: (SHAPES as readonly unknown[]).includes(v.shape) ? (v.shape as Shape) : base.shape,
  }
}

/** Lo guardado, saneado: lo que no se entienda toma su valor por defecto. */
export function sanitizeLook(raw: unknown): LookPreference {
  const o = isObject(raw) ? raw : {}
  const saved = (Array.isArray(o.saved) ? o.saved : [])
    .map(sanitizeSaved)
    .filter((s): s is SavedLook => s !== null)
    .slice(0, MAX_SAVED_LOOKS)
  const ids = [...PRESET_IDS, ...saved.map((s) => s.id)] as string[]
  return {
    theme: typeof o.theme === 'string' && ids.includes(o.theme) ? o.theme : DEFAULT_LOOK.theme,
    saved,
    page: setting(o.page),
    menu: setting(o.menu),
    primaries: Object.fromEntries(
      Object.entries(isObject(o.primaries) ? o.primaries : {}).filter(
        ([k, v]) => ids.includes(k) && (v === 'brand' || isHex(v)),
      ),
    ) as Record<string, string>,
    open: {
      presets: !isObject(o.open) || o.open.presets !== false,
      mine: !isObject(o.open) || o.open.mine !== false,
    },
    chart: Object.fromEntries(
      Object.entries(isObject(o.chart) ? o.chart : {}).filter(([k, v]) => isChartKey(k) && isHex(v)),
    ),
    chartDash: Object.fromEntries(
      Object.entries(isObject(o.chartDash) ? o.chartDash : {}).filter(([k, v]) => isLineKey(k) && isLineStyle(v)),
    ),
    font: isFontId(o.font) ? o.font : DEFAULT_LOOK.font,
  }
}

// --- Formato en la cuenta ------------------------------------------------------------------
// El backend acepta objetos de un nivel con textos cortos (hasta 40) y sí/no: el estilo va en
// el grupo `look` y cada tema propio en su propio grupo `lt_<id>`, con claves cortas.

const LOOK_GROUP = 'look'
const THEME_GROUP = 'lt_'

type Group = Record<string, string | boolean>

/** Estilo en el formato de la cuenta (se mezcla con el resto de preferencias). */
export function lookToStored(p: LookPreference): Record<string, Group> {
  const look: Group = {
    t: p.theme,
    ps: p.page.show,
    pz: String(p.page.size),
    ms: p.menu.show,
    mz: String(p.menu.size),
    op: p.open.presets,
    om: p.open.mine,
    f: p.font,
  }
  for (const [id, color] of Object.entries(p.primaries)) look[`p_${id}`] = color
  for (const [key, color] of Object.entries(p.chart)) look[`k_${key}`] = color
  for (const [key, dash] of Object.entries(p.chartDash)) look[`d_${key}`] = dash
  const out: Record<string, Group> = { [LOOK_GROUP]: look }
  for (const t of p.saved)
    out[THEME_GROUP + t.id] = {
      n: t.name,
      p: t.primary,
      m: t.menu,
      a: t.active,
      b: t.background,
      pp: t.pagePattern,
      pc: t.pageColor,
      mp: t.menuPattern,
      mc: t.menuColor,
      pi: t.pageIcons.join(','),
      mi: t.menuIcons.join(','),
      tb: t.topbar,
      sh: t.shape,
    }
  return out
}

/** Estilo leído de la cuenta (null si la cuenta aún no tiene uno guardado). */
export function lookFromStored(raw: Record<string, unknown>): LookPreference | null {
  const look = raw[LOOK_GROUP]
  if (!isObject(look)) return null
  const saved = Object.entries(raw)
    .filter(([k, v]) => k.startsWith(THEME_GROUP) && isObject(v))
    .map(([k, v]) => {
      const t = v as Record<string, unknown>
      return {
        id: k.slice(THEME_GROUP.length),
        name: t.n,
        primary: t.p,
        menu: t.m,
        active: t.a,
        background: t.b,
        pagePattern: t.pp,
        pageColor: t.pc,
        menuPattern: t.mp,
        menuColor: t.mc,
        pageIcons: t.pi,
        menuIcons: t.mi,
        topbar: t.tb,
        shape: t.sh,
      }
    })
  const primaries = Object.fromEntries(
    Object.entries(look)
      .filter(([k]) => k.startsWith('p_'))
      .map(([k, v]) => [k.slice(2), v]),
  )
  return sanitizeLook({
    theme: look.t,
    saved,
    page: { show: look.ps, size: look.pz },
    menu: { show: look.ms, size: look.mz },
    primaries,
    chart: Object.fromEntries(
      Object.entries(look)
        .filter(([k]) => k.startsWith('k_'))
        .map(([k, v]) => [k.slice(2), v]),
    ),
    chartDash: Object.fromEntries(
      Object.entries(look)
        .filter(([k]) => k.startsWith('d_'))
        .map(([k, v]) => [k.slice(2), v]),
    ),
    open: { presets: look.op, mine: look.om },
    font: look.f,
  })
}
