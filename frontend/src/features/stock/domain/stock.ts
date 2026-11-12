import { z } from 'zod'
import { addDays, type IsoDate } from '@/shared/domain/dates'
import { productSchema, type Product } from '@/features/catalog/domain/schemas'

/** Contratos del stock de despacho, validados al recibirlos. */
export const stockLineSchema = z.object({
  product_id: z.string(),
  units: z.number().int().nonnegative(),
  kg: z.number().nonnegative(),
  location: z.string(),
  // Fecha de beneficio del lote.
  lot_date: z.string(),
})
export type StockLine = z.infer<typeof stockLineSchema>

export const stockDaySchema = z.object({
  date: z.string(),
  lines: z.array(stockLineSchema),
  total_units: z.number().int(),
  total_kg: z.number(),
  recorded_by: z.string(),
  recorded_at: z.string(),
})
export type StockDay = z.infer<typeof stockDaySchema>

/** Con qué se arma el formulario: artículos (incluye calidad B) y ubicaciones. */
export const stockOptionsSchema = z.object({
  items: z.array(productSchema),
  locations: z.array(z.string()),
  // Antigüedad máxima (días) de los lotes que descuenta la saca.
  lot_days: z.number().int(),
})
export type StockOptions = z.infer<typeof stockOptionsSchema>

/** Lo que se envía: unidades de un producto en un lote (los kg los calcula el backend). */
export interface StockEntry {
  product_id: string
  units: number
  lot_date: IsoDate
}

/** Días hacia atrás que se pueden registrar o corregir (igual que el backend). */
export const STOCK_BACK_DAYS = 7
const MAX_UNITS = 1_000_000

/** ¿Se puede registrar o corregir ese día? Hoy y los 7 anteriores; nunca un día futuro. */
export const isEditableDay = (day: IsoDate, ref: IsoDate) => day <= ref && day >= addDays(ref, -STOCK_BACK_DAYS)

/** Días que se pueden registrar, del más reciente al más antiguo. */
export const editableDays = (ref: IsoDate): IsoDate[] =>
  Array.from({ length: STOCK_BACK_DAYS + 1 }, (_, i) => addDays(ref, -i))

/** Unidades: solo dígitos. Vacío = sin dato. */
export function parseUnits(raw: string): number | null {
  const digits = raw.replace(/\D/g, '').slice(0, 7)
  if (digits === '') return null
  return Math.min(Number(digits), MAX_UNITS)
}

// --- Cómo se mira el stock (se recuerda en el equipo) -------------------------------------

export const ALL = 'ALL'
export const UNITS = ['units', 'kg', 'both'] as const
export const QUALITIES = [ALL, 'A', 'B'] as const
/** Lotes que se pueden mostrar: del día del stock hasta 8 días atrás (el pollo dura unos 8 días). */
export const LOT_OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const

export const stockViewSchema = z.object({
  /** Lotes elegidos, como días hacia atrás desde el día del stock (así sirven para cualquier día). */
  lots: z.array(z.number().int().min(0).max(8)).min(1),
  location: z.string(),
  type: z.string(),
  quality: z.enum(QUALITIES),
  unit: z.enum(UNITS),
})
export type StockView = z.infer<typeof stockViewSchema>

export const defaultView = (lotDays = 3): StockView => ({
  lots: Array.from({ length: Math.min(lotDays, 8) + 1 }, (_, i) => i),
  location: ALL,
  type: ALL,
  quality: ALL,
  unit: 'units',
})

const VIEW_KEY = 'stock.view'
export function storedView(storage: Pick<Storage, 'getItem'> | undefined, lotDays?: number): StockView {
  try {
    const parsed = stockViewSchema.safeParse(JSON.parse(storage?.getItem(VIEW_KEY) ?? 'null'))
    if (parsed.success) return parsed.data
  } catch {
    // Lo guardado no sirve: se vuelve a la vista de partida.
  }
  return defaultView(lotDays)
}
export const storeView = (storage: Pick<Storage, 'setItem'> | undefined, view: StockView) =>
  storage?.setItem(VIEW_KEY, JSON.stringify(view))

/** Marca o desmarca un lote; nunca deja la lista vacía. */
export function toggleLot(lots: number[], offset: number): number[] {
  const next = lots.includes(offset) ? lots.filter((o) => o !== offset) : [...lots, offset]
  return next.length ? next.sort((a, b) => a - b) : lots
}

/** Tipo de un artículo: su tamaño (Brasa chica…) o, si no tiene, su categoría. */
export const typeOf = (p: Product) => p.subcategory ?? p.category

export const typesOf = (items: Product[]) => [...new Set(items.map(typeOf))]

/** Artículos que pasan los filtros de tipo y calidad, agrupados por tipo. */
export function visibleGroups(items: Product[], view: Pick<StockView, 'type' | 'quality'>) {
  const shown = items.filter(
    (p) =>
      (view.type === ALL || typeOf(p) === view.type) && (view.quality === ALL || (p.quality ?? 'A') === view.quality),
  )
  return typesOf(shown).map((name) => ({ name, items: shown.filter((p) => typeOf(p) === name) }))
}

/** Líneas del día en la ubicación elegida (todas, si no se eligió ninguna). */
export const linesAt = (day: StockDay | undefined, location: string) =>
  (day?.lines ?? []).filter((l) => location === ALL || l.location === location)

/** Fechas de lote que se muestran: las elegidas y cualquiera que ya tenga cantidades. */
export function shownLots(day: IsoDate, offsets: number[], lines: StockLine[]): IsoDate[] {
  const chosen = offsets.map((o) => addDays(day, -o))
  const withData = lines.filter((l) => l.units > 0).map((l) => l.lot_date)
  return [...new Set([...chosen, ...withData])].sort()
}

/** Ubicaciones a ofrecer: las configuradas y cualquiera que ya tenga stock registrado. */
export const locationsOf = (configured: string[], days: StockDay[]) => [
  ...new Set([...configured, ...days.flatMap((d) => d.lines.map((l) => l.location))]),
]

// --- Borrador de la cuadrícula: producto × lote → texto escrito ---------------------------

export type StockDraft = Record<string, string>
export const cellKey = (productId: string, lot: IsoDate) => `${productId}|${lot}`

export function draftOf(lines: StockLine[]): StockDraft {
  const totals = new Map<string, number>()
  for (const l of lines) {
    const key = cellKey(l.product_id, l.lot_date)
    totals.set(key, (totals.get(key) ?? 0) + l.units)
  }
  // Un cero guardado se muestra vacío: la celda en blanco ya se lee como 0.
  return Object.fromEntries([...totals].filter(([, n]) => n > 0).map(([key, n]) => [key, String(n)]))
}

export const unitsAt = (draft: StockDraft, productId: string, lot: IsoDate) =>
  parseUnits(draft[cellKey(productId, lot)] ?? '') ?? 0

const round2 = (n: number) => Math.round(n * 100) / 100
export const kgOf = (p: Product, units: number) => round2(units * p.kg_per_unit)

export interface StockTotals {
  units: number
  kg: number
  unitsA: number
  unitsB: number
}

/** Totales de lo escrito para un conjunto de artículos, en todos sus lotes. */
export function draftTotals(items: Product[], draft: StockDraft): StockTotals {
  const byId = new Map(items.map((p) => [p.id, p]))
  const t = { units: 0, kg: 0, unitsA: 0, unitsB: 0 }
  for (const [key, raw] of Object.entries(draft)) {
    const product = byId.get(key.split('|')[0] ?? '')
    const units = parseUnits(raw) ?? 0
    if (!product || !units) continue
    t.units += units
    t.kg += units * product.kg_per_unit
    if (product.quality === 'B') t.unitsB += units
    else t.unitsA += units
  }
  return { ...t, kg: round2(t.kg) }
}

/** Lo que se guarda: una línea por celda con cantidad. Sin ninguna, un cero para dejar constancia. */
export function toEntries(items: Product[], draft: StockDraft, day: IsoDate): StockEntry[] {
  const ids = new Set(items.map((p) => p.id))
  const entries = Object.entries(draft).flatMap(([key, raw]) => {
    const [productId = '', lot = day] = key.split('|')
    const units = parseUnits(raw) ?? 0
    return units > 0 && ids.has(productId) ? [{ product_id: productId, units, lot_date: lot }] : []
  })
  const first = items[0]
  return entries.length || !first ? entries : [{ product_id: first.id, units: 0, lot_date: day }]
}

/** Unidades por ubicación de un día (para el resumen de «todas las ubicaciones»). */
export function byLocation(day: StockDay | undefined): { location: string; units: number }[] {
  const totals = new Map<string, number>()
  for (const l of day?.lines ?? []) totals.set(l.location, (totals.get(l.location) ?? 0) + l.units)
  return [...totals].map(([location, units]) => ({ location, units }))
}
