import type { Product, Units } from '@/features/catalog/domain/schemas'
import {
  allOfLabel,
  joinLabels,
  shortSizeLabel,
  type ProductChoice,
  type ProductSelection,
} from '@/features/catalog/types/catalog'

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

  /** Opciones del selector: por categoría, «Todas las brasas» y luego cada tamaño. */
  get choices(): ProductChoice[] {
    return this.categories.flatMap((category) => {
      const subs = this.subcategories(category)
      if (!subs.length) return [{ category, subcategory: null, label: category }]
      return [
        { category, subcategory: null, label: allOfLabel(category) },
        ...subs.map((subcategory) => ({ category, subcategory, label: subcategory })),
      ]
    })
  }

  /** Productos de una selección (categoría entera o un tamaño). */
  selected(sel: ProductSelection): Product[] {
    return this.of(sel.category, sel.subcategory)
  }

  /** Nombre corto de la selección: "Todas las brasas" o "Brasa chica". */
  label(sel: ProductSelection): string {
    if (sel.subcategory) return sel.subcategory
    return this.subcategories(sel.category).length ? allOfLabel(sel.category) : sel.category
  }

  /** Para resúmenes: "Todas las brasas (chica, mediana y grande)" o "Brasa chica". */
  detailedLabel(sel: ProductSelection): string {
    const subs = this.subcategories(sel.category)
    if (sel.subcategory || !subs.length) return this.label(sel)
    return `${allOfLabel(sel.category)} (${joinLabels(subs.map((s) => shortSizeLabel(sel.category, s)))})`
  }

  /** Nombre de un día ya registrado según los tamaños que tienen unidades: "Brasa chica y mediana". */
  dayLabel(category: string, units: Units): string {
    const subs = this.subcategories(category)
    const used = subs.filter((s) => this.of(category, s).some((p) => (units[p.id] ?? 0) > 0))
    if (!subs.length || !used.length || used.length === subs.length) return this.label({ category, subcategory: null })
    const [first, ...rest] = used
    return joinLabels([first, ...rest.map((s) => shortSizeLabel(category, s))])
  }

  /** Solo las unidades de los productos de la selección. */
  pick(units: Units | undefined, sel: ProductSelection): Units {
    const ids = new Set(this.selected(sel).map((p) => p.id))
    return Object.fromEntries(Object.entries(units ?? {}).filter(([id]) => ids.has(id)))
  }

  /** Unidades de los demás productos de la categoría (lo que se conserva al enviar un tamaño). */
  others(units: Units | undefined, sel: ProductSelection): Units {
    const ids = new Set(this.selected(sel).map((p) => p.id))
    return Object.fromEntries(Object.entries(units ?? {}).filter(([id]) => !ids.has(id)))
  }

  product(id: string): Product | undefined {
    return this.byId.get(id)
  }

  kg(units: Units): number {
    return Object.entries(units).reduce((s, [id, u]) => s + u * (this.byId.get(id)?.kg_per_unit ?? 0), 0)
  }
}

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

export const sumUnits = (units: Units | undefined) => Object.values(units ?? {}).reduce((a, b) => a + b, 0)

export function addUnits(a: Units, b: Units): Units {
  const out = { ...a }
  for (const [id, u] of Object.entries(b)) out[id] = (out[id] ?? 0) + u
  return out
}
