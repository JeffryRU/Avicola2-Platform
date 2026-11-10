import { z } from 'zod'
import { isoDateSchema } from '@/shared/domain/schemas'
import type { Catalog } from '@/features/catalog/domain/catalog'

export const CHANGE_ACTIONS = ['created', 'updated'] as const
export type ChangeAction = (typeof CHANGE_ACTIONS)[number]

const unitsSchema = z.record(z.string(), z.number().int())

/** Un cambio de proyección: quién, cuándo, de qué vendedor y día, y qué cambió. */
export const changeSchema = z.object({
  id: z.number().int(),
  seller: z.string(),
  date: isoDateSchema,
  category: z.string(),
  author: z.string(),
  action: z.enum(CHANGE_ACTIONS),
  before: unitsSchema.nullable(),
  after: unitsSchema,
  before_total: z.number().int().nullable(),
  after_total: z.number().int(),
  after_cutoff: z.boolean(),
  changed_at: z.string(),
  // Hoja de registro que dejó el cambio (sin número en los cambios anteriores a las hojas).
  sheet: z.number().int().nullish(),
})
export type ProjectionChange = z.infer<typeof changeSchema>

export interface ChangedLine {
  product: string
  before: number
  after: number
}

/** Los productos cuyo valor cambió, en el orden del catálogo (en una creación, los que tienen unidades). */
export function changedLines(change: ProjectionChange, catalog: Catalog): ChangedLine[] {
  return catalog
    .of(change.category)
    .map((p) => ({ product: p.name, before: change.before?.[p.id] ?? 0, after: change.after[p.id] ?? 0 }))
    .filter((l) => (change.before ? l.before !== l.after : l.after > 0))
}

/** El autor no es el vendedor: lo cambió el supervisor. */
export const bySupervisor = (c: ProjectionChange) => c.author !== c.seller
