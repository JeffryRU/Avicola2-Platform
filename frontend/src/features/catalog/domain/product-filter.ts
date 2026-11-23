import type { Product } from '@/shared/domain/products'

/** Orden de la lista de productos: el del catálogo o por peso por unidad. */
export const PRODUCT_SORTS = ['catalog', 'light', 'heavy'] as const
export type ProductSort = (typeof PRODUCT_SORTS)[number]

export interface ProductFilter {
  /** Tamaño (subcategoría); null = todos. */
  size: string | null
  /** Texto a buscar en el nombre (sin distinguir mayúsculas ni tildes). */
  search: string
  sort: ProductSort
}

export const NO_FILTER: ProductFilter = { size: null, search: '', sort: 'catalog' }

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** Productos que pasan el filtro, en el orden pedido. */
export function filterProducts(products: Product[], f: ProductFilter): Product[] {
  const q = plain(f.search)
  const kept = products.filter((p) => (!f.size || p.subcategory === f.size) && (!q || plain(p.name).includes(q)))
  if (f.sort === 'catalog') return kept
  const dir = f.sort === 'light' ? 1 : -1
  return [...kept].sort((a, b) => dir * (a.kg_per_unit - b.kg_per_unit))
}

/** Si el filtro está quitando algo (para mostrar «Limpiar filtros»). */
export const isFiltered = (f: ProductFilter) => f.size !== null || f.search.trim() !== '' || f.sort !== 'catalog'
