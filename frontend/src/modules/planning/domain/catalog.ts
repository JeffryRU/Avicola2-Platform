import type { Product, Units } from '@/modules/planning/domain/schemas'

/** Catálogo indexado: los kg siempre salen del peso por unidad del producto. */
export class Catalog {
  readonly products: Product[]
  private readonly byId: Map<string, Product>

  constructor(products: Product[]) {
    this.products = [...products].sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order)
    this.byId = new Map(this.products.map((p) => [p.id, p]))
  }

  get categories(): string[] {
    return [...new Set(this.products.map((p) => p.category))]
  }

  /** Productos de la categoría; con subcategoría, solo los de ese grupo (p. ej. Brasa chica). */
  of(category: string, subcategory: string | null = null): Product[] {
    return this.products.filter((p) => p.category === category && (!subcategory || p.subcategory === subcategory))
  }

  subcategories(category: string): string[] {
    return [...new Set(this.of(category).flatMap((p) => (p.subcategory ? [p.subcategory] : [])))]
  }

  /** Opciones del selector: por categoría, «Todas las brasas» y luego cada subcategoría. */
  get choices(): ProductChoice[] {
    return this.categories.flatMap((category) => {
      const subs = this.subcategories(category)
      if (!subs.length) return [{ category, subcategory: null, label: category }]
      return [
        { category, subcategory: null, label: allOf(category) },
        ...subs.map((subcategory) => ({ category, subcategory, label: subcategory })),
      ]
    })
  }

  label(category: string, subcategory: string | null): string {
    return subcategory ?? (this.subcategories(category).length ? allOf(category) : category)
  }

  /** Para resúmenes: "Todas las brasas (chica, mediana y grande)" o "Brasa chica". */
  detailedLabel(category: string, subcategory: string | null): string {
    const subs = this.subcategories(category)
    if (subcategory || !subs.length) return this.label(category, subcategory)
    const prefix = new RegExp(`^${category}\\s+`, 'i')
    const names = subs.map((s) => s.replace(prefix, ''))
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0]
    return `${allOf(category)} (${list})`
  }

  product(id: string): Product | undefined {
    return this.byId.get(id)
  }

  kg(units: Units): number {
    return Object.entries(units).reduce((s, [id, u]) => s + u * (this.byId.get(id)?.kg_per_unit ?? 0), 0)
  }
}

export interface ProductChoice {
  category: string
  subcategory: string | null
  label: string
}

/** "BRASA" → "Todas las brasas". */
function allOf(category: string): string {
  const name = category.toLowerCase()
  return `Todas las ${name.endsWith('s') ? name : `${name}s`}`
}

/** Productos agrupados por subcategoría (Brasa chica, mediana...), en el orden en que llegan. */
export function bySubcategory(products: Product[]): { name: string | null; products: Product[] }[] {
  const groups: { name: string | null; products: Product[] }[] = []
  for (const p of products) {
    const name = p.subcategory ?? null
    const last = groups.at(-1)
    if (last && last.name === name) last.products.push(p)
    else groups.push({ name, products: [p] })
  }
  return groups
}

export const sumUnits = (units: Units | undefined) => Object.values(units ?? {}).reduce((a, b) => a + b, 0)

export function addUnits(a: Units, b: Units): Units {
  const out = { ...a }
  for (const [id, u] of Object.entries(b)) out[id] = (out[id] ?? 0) + u
  return out
}
