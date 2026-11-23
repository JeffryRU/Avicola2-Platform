import type { Product } from '@/shared/domain/products'

// Respaldo del stock mientras el servidor no responde (mismo origen que el catálogo de respaldo).

/** Artículos de calidad B, que solo aparecen en el stock. */
export const DEFAULT_QUALITY_B: Product[] = [
  {
    id: 'P0101',
    category: 'BRASA',
    name: 'Brasa chica B',
    kg_per_unit: 1.3,
    sort_order: 13,
    subcategory: 'Brasa chica',
    quality: 'B',
  },
  {
    id: 'P0102',
    category: 'BRASA',
    name: 'Brasa mediana B',
    kg_per_unit: 1.65,
    sort_order: 14,
    subcategory: 'Brasa mediana',
    quality: 'B',
  },
  {
    id: 'P0103',
    category: 'BRASA',
    name: 'Brasa grande B',
    kg_per_unit: 1.9,
    sort_order: 15,
    subcategory: 'Brasa grande',
    quality: 'B',
  },
  {
    id: 'P0112',
    category: 'Pollo de mercado',
    name: 'Pollo entero carne sin menudencia B',
    kg_per_unit: 1.8,
    sort_order: 16,
    subcategory: null,
    quality: 'B',
  },
]

/** Ubicaciones de respaldo (las de STOCK_LOCATIONS por defecto en el backend). */
// Sin servidor: solo el stock general (todo se almacena en un solo lugar).
export const DEFAULT_LOCATIONS = ['General']
export const DEFAULT_LOT_DAYS = 3
