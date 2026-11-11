import { z } from 'zod'
import type { Product } from '@/features/catalog/domain/schemas'
import { parseUnits } from '@/features/stock/domain/stock'

/** Producción diaria: lo pedido a granja y lo que llegó, por producto. */
export const productionLineSchema = z.object({
  product_id: z.string(),
  ordered: z.number().nonnegative(),
  produced: z.number().int().nonnegative(),
  quality_a: z.number().int(),
  quality_b: z.number().int().nonnegative(),
})
export type ProductionLine = z.infer<typeof productionLineSchema>

export const productionDaySchema = z.object({
  date: z.string(),
  lines: z.array(productionLineSchema),
  ordered: z.number(),
  produced: z.number().int(),
  quality_b: z.number().int(),
  // Peso vivo promedio (kg) de la parvada por tipo; solo los que se anotaron.
  weights: z.record(z.string(), z.number()).default({}),
  recorded_by: z.string(),
  recorded_at: z.string(),
})
export type ProductionDay = z.infer<typeof productionDaySchema>

export interface ProductionEntry {
  product_id: string
  ordered: number
  produced: number
  quality_b: number
}

export const FIELDS = ['ordered', 'produced', 'quality_b'] as const
export type Field = (typeof FIELDS)[number]
/** Lo que la persona escribe por producto (texto; vacío = 0). */
export type ProductionDraft = Record<string, Record<Field, string>>

const blank = (): Record<Field, string> => ({ ordered: '', produced: '', quality_b: '' })
const text = (n: number | undefined) => (n ? String(Math.round(n)) : '')

export function draftOf(products: Product[], day?: ProductionDay): ProductionDraft {
  const saved = new Map((day?.lines ?? []).map((l) => [l.product_id, l]))
  return Object.fromEntries(
    products.map((p) => {
      const l = saved.get(p.id)
      return [
        p.id,
        l ? { ordered: text(l.ordered), produced: text(l.produced), quality_b: text(l.quality_b) } : blank(),
      ]
    }),
  )
}

const value = (draft: ProductionDraft, id: string, field: Field) => parseUnits(draft[id]?.[field] ?? '') ?? 0

export function toEntries(products: Product[], draft: ProductionDraft): ProductionEntry[] {
  return products.map((p) => ({
    product_id: p.id,
    ordered: value(draft, p.id, 'ordered'),
    produced: value(draft, p.id, 'produced'),
    quality_b: value(draft, p.id, 'quality_b'),
  }))
}

export function totals(products: Product[], draft: ProductionDraft) {
  const sum = (field: Field) => products.reduce((s, p) => s + value(draft, p.id, field), 0)
  const produced = sum('produced')
  const qualityB = sum('quality_b')
  return { ordered: sum('ordered'), produced, qualityB, bShare: produced ? qualityB / produced : 0 }
}

/** Productos donde la calidad B supera lo producido (no se puede guardar así). */
export const invalidQuality = (products: Product[], draft: ProductionDraft) =>
  products.filter((p) => value(draft, p.id, 'quality_b') > value(draft, p.id, 'produced'))

/** Diferencia entre lo que llegó y lo pedido, en aves y en porcentaje de lo pedido. */
export function deviation(ordered: number, produced: number) {
  const birds = produced - ordered
  return { birds, share: ordered ? birds / ordered : 0 }
}

/** Peso promedio de la parvada por tipo, como lo escribe la persona (texto; vacío = sin dato). */
export type WeightDraft = Record<string, string>
export const MIN_FLOCK_KG = 0.5
export const MAX_FLOCK_KG = 6

export const weightDraftOf = (groups: string[], weights: Record<string, number> = {}): WeightDraft =>
  Object.fromEntries(groups.map((g) => [g, weights[g] ? String(weights[g]) : '']))

/** Acepta coma o punto decimal. null si no es un número. */
export function parseKg(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  return Number(text)
}

/** Solo los tipos con peso escrito. */
export function toWeights(draft: WeightDraft): Record<string, number> {
  const entries = Object.entries(draft).flatMap(([group, raw]) => {
    const kg = parseKg(raw)
    return kg ? [[group, kg] as const] : []
  })
  return Object.fromEntries(entries)
}

/** Tipos cuyo peso escrito no es válido (no es número o está fuera de rango). */
export const invalidWeights = (draft: WeightDraft) =>
  Object.entries(draft)
    .filter(([, raw]) => {
      if (!raw.trim()) return false
      const kg = parseKg(raw)
      return kg === null || kg < MIN_FLOCK_KG || kg > MAX_FLOCK_KG
    })
    .map(([group]) => group)

/** Solo dígitos y un separador decimal, como máximo 3 decimales. */
export const cleanKg = (raw: string) => /^\d{0,1}([.,]\d{0,3})?$/.exec(raw.trim())?.[0] ?? null
