import { z } from 'zod'

/** Contratos del catálogo, validados al recibirlos. */
export const unitsSchema = z.record(z.string(), z.number().int().nonnegative())
/** Unidades por producto (id → unidades). */
export type Units = z.infer<typeof unitsSchema>

export const productSchema = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  kg_per_unit: z.number().positive(),
  sort_order: z.number().int(),
  subcategory: z.string().nullish(),
  // «A» o «B». La calidad B solo aparece en el stock de despacho.
  quality: z.string().optional(),
})
export type Product = z.infer<typeof productSchema>
