import type { Product } from '@/shared/domain/products'

/**
 * Catálogo de respaldo (el mismo de backend/config/planning_seed.yaml): se usa solo mientras el
 * servidor no responde y aún no hay un catálogo guardado en el equipo, para que las tablas se
 * vean. En cuanto llega el del servidor, manda ese.
 */
const brasa = (n: number, subcategory: string, kg: number): Product => ({
  id: `P${String(n).padStart(4, '0')}`,
  category: 'BRASA',
  name: `Brasa ${String(n)}`,
  kg_per_unit: kg,
  sort_order: n - 1,
  subcategory,
  quality: 'A',
})

export const DEFAULT_PRODUCTS: Product[] = [
  brasa(1, 'Brasa chica', 1.0),
  brasa(2, 'Brasa chica', 1.2),
  brasa(3, 'Brasa chica', 1.3),
  brasa(4, 'Brasa chica', 1.4),
  brasa(5, 'Brasa chica', 1.5),
  brasa(6, 'Brasa mediana', 1.6),
  brasa(7, 'Brasa mediana', 1.7),
  brasa(8, 'Brasa grande', 1.8),
  brasa(9, 'Brasa grande', 1.9),
  brasa(10, 'Brasa grande', 2.0),
  {
    id: 'P0011',
    category: 'Pollo de mercado',
    name: 'Pollo entero con menudencia',
    kg_per_unit: 2.07,
    sort_order: 10,
    subcategory: null,
    quality: 'A',
  },
  {
    id: 'P0012',
    category: 'Pollo de mercado',
    name: 'Pollo entero carne sin menudencia',
    kg_per_unit: 1.8,
    sort_order: 11,
    subcategory: null,
    quality: 'A',
  },
]
