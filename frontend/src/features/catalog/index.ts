/** Punto de entrada público de la feature: otras features y app/ importan solo desde aquí (ADR 0008). */
export type { CatalogGateway } from '@/features/catalog/application/ports'
export { Catalog } from '@/features/catalog/domain/catalog'
export { DEFAULT_PRODUCTS } from '@/features/catalog/domain/defaults'
export type { ProductChoice, ProductSelection } from '@/features/catalog/types/catalog'
export { capitalize, categoryName, kgPerUnitLabel, shortSizeLabel } from '@/features/catalog/types/catalog'
export { useCatalog } from '@/features/catalog/ui/hooks'
