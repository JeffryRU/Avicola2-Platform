import type { Product } from '@/shared/domain/products'

/** Catálogo de productos activos (categorías, tamaños y peso por unidad). */
export interface CatalogGateway {
  catalog(): Promise<Product[]>
}
