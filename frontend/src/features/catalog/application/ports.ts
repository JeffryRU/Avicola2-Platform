import type { Product } from '@/features/catalog/domain/schemas'

/** Catálogo de productos activos (categorías, tamaños y peso por unidad). */
export interface CatalogGateway {
  catalog(): Promise<Product[]>
}
