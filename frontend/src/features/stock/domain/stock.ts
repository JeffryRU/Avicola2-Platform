import { z } from 'zod'
import { addDays, type IsoDate } from '@/shared/domain/dates'
import type { Product } from '@/features/catalog/domain/schemas'

/** Contratos del stock de despacho, validados al recibirlos. */
export const stockLineSchema = z.object({
  product_id: z.string(),
  units: z.number().int().nonnegative(),
  kg: z.number().nonnegative(),
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

/** Lo que se envía por producto: sin kg, el backend usa el peso promedio. */
export interface StockEntry {
  product_id: string
  units: number
  kg?: number
}

/** Días hacia atrás que se pueden registrar o corregir (igual que el backend). */
export const STOCK_BACK_DAYS = 7
const MAX_UNITS = 1_000_000

/** ¿Se puede registrar o corregir ese día? Hoy y los 7 anteriores; nunca un día futuro. */
export const isEditableDay = (day: IsoDate, ref: IsoDate) => day <= ref && day >= addDays(ref, -STOCK_BACK_DAYS)

/** Días que se pueden registrar, del más reciente al más antiguo. */
export const editableDays = (ref: IsoDate): IsoDate[] =>
  Array.from({ length: STOCK_BACK_DAYS + 1 }, (_, i) => addDays(ref, -i))

/** Lo que la persona escribe en cada celda (texto, para no pelear con el teclado). */
export type StockDraft = Record<string, { units: string; kg: string }>

export function draftOf(products: Product[], day?: StockDay): StockDraft {
  const saved = new Map((day?.lines ?? []).map((l) => [l.product_id, l]))
  return Object.fromEntries(
    products.map((p) => {
      const line = saved.get(p.id)
      // Un cero guardado se muestra vacío: la celda en blanco ya se lee como 0.
      const text = (n: number | undefined) => (n ? String(n) : '')
      return [p.id, { units: text(line?.units), kg: text(line?.kg) }]
    }),
  )
}

/** Unidades: solo dígitos. Vacío = sin dato. */
export function parseUnits(raw: string): number | null {
  const digits = raw.replace(/\D/g, '').slice(0, 7)
  if (digits === '') return null
  return Math.min(Number(digits), MAX_UNITS)
}

/** Kg con hasta dos decimales; acepta coma o punto. Vacío o inválido = sin dato. */
export function parseKg(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!/^\d{1,8}(\.\d{0,2})?$/.test(text)) return null
  return Number(text)
}

const estimate = (p: Product, units: number) => Math.round(units * p.kg_per_unit * 100) / 100

/** Kg de una fila: lo escrito o, si falta, unidades por el peso promedio. */
export function kgOf(p: Product, cell: { units: string; kg: string } | undefined): number {
  const typed = parseKg(cell?.kg ?? '')
  return typed ?? estimate(p, parseUnits(cell?.units ?? '') ?? 0)
}

export function draftTotals(products: Product[], draft: StockDraft) {
  const units = products.reduce((sum, p) => sum + (parseUnits(draft[p.id]?.units ?? '') ?? 0), 0)
  const kg = products.reduce((sum, p) => sum + kgOf(p, draft[p.id]), 0)
  return { units, kg: Math.round(kg * 100) / 100 }
}

/** ¿Hay algún kg escrito que no sea un número válido? */
export const invalidKg = (draft: StockDraft) =>
  Object.values(draft).some((c) => c.kg.trim() !== '' && parseKg(c.kg) === null)

/** Una línea por producto del catálogo: lo que queda en blanco se registra como 0. */
export function toEntries(products: Product[], draft: StockDraft): StockEntry[] {
  return products.map((p) => {
    const cell = draft[p.id]
    const kg = parseKg(cell?.kg ?? '')
    return { product_id: p.id, units: parseUnits(cell?.units ?? '') ?? 0, ...(kg === null ? {} : { kg }) }
  })
}
