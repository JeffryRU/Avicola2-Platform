import { z } from 'zod'

/**
 * Productos y unidades por producto: el idioma común de proyecciones, stock, saca, producción y
 * dashboards. Los contratos se validan al recibirlos.
 */
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

/** Tipo de un producto: su tamaño (Brasa chica…) o, si no tiene, su categoría. Así se agrupa el pedido a granja y el stock. */
export const productType = (p: Pick<Product, 'category' | 'subcategory'>) => p.subcategory ?? p.category

/** Productos agrupados por subcategoría (Brasa chica, mediana...), en el orden en que llegan. */
export function bySubcategory(products: Product[]): { name: string | null; products: Product[] }[] {
  const groups: { name: string | null; products: Product[] }[] = []
  for (const p of products) {
    const name = p.subcategory ?? null
    const last = groups.at(-1)
    if (last?.name === name) last.products.push(p)
    else groups.push({ name, products: [p] })
  }
  return groups
}

/** Total de unidades (sin datos = 0). */
export const sumUnits = (units: Units | undefined) => Object.values(units ?? {}).reduce((a, b) => a + b, 0)

/** Suma por producto de dos conjuntos de unidades. */
export function addUnits(a: Units, b: Units): Units {
  const out = { ...a }
  for (const [id, u] of Object.entries(b)) out[id] = (out[id] ?? 0) + u
  return out
}
