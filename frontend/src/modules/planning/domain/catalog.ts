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

  of(category: string): Product[] {
    return this.products.filter((p) => p.category === category)
  }

  product(id: string): Product | undefined {
    return this.byId.get(id)
  }

  kg(units: Units): number {
    return Object.entries(units).reduce((s, [id, u]) => s + u * (this.byId.get(id)?.kg_per_unit ?? 0), 0)
  }
}

export const sumUnits = (units: Units | undefined) => Object.values(units ?? {}).reduce((a, b) => a + b, 0)

export function addUnits(a: Units, b: Units): Units {
  const out = { ...a }
  for (const [id, u] of Object.entries(b)) out[id] = (out[id] ?? 0) + u
  return out
}
