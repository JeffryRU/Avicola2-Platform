/** Textos de la pantalla «Productos» (única fuente). */
import type { ProductSort } from '@/features/catalog/domain/product-filter'

export const PRODUCTS_TITLE = 'Productos'
export const PRODUCTS_SUBTITLE = 'Presentaciones y conversión de unidades a kilos.'
export const SIZE_LABEL = 'Tamaño'
export const ALL_SIZES = 'Todos los tamaños'
export const CATEGORY_LABEL = 'Categoría'
export const SEARCH_LABEL = 'Buscar producto'
export const SEARCH_PLACEHOLDER = 'Buscar por nombre…'
export const SORT_LABEL = 'Ordenar'
export const SORT_NAMES: Record<ProductSort, string> = {
  catalog: 'Orden del catálogo',
  light: 'Más livianos primero',
  heavy: 'Más pesados primero',
}
export const SORT_NEXT = (next: string) => `Toca para: ${next.toLowerCase()}`
export const VIEW_NAMES = { cards: 'Tarjetas', table: 'Tabla' } as const
export const CLEAR_FILTERS = 'Limpiar filtros'
export const productsCount = (n: number, total: number) =>
  n === total ? `${String(n)} productos` : `${String(n)} de ${String(total)} productos`
export const NO_MATCH_TITLE = 'Ningún producto coincide'
export const NO_MATCH_BODY = 'Prueba con otro nombre o tamaño.'
export const NO_SIZE = 'Sin tamaño'

export const KG_PER_UNIT = 'kg por unidad'
export const WEIGHT_BAR = (name: string, kg: string) => `${name}: ${kg}`
export const PICK_FOR_CALC = (name: string) => `Usar ${name} en la calculadora`
export const IN_CALCULATOR = 'En la calculadora'

export const CALC_TITLE = 'Calculadora'
export const CALC_HINT = 'Toca un producto de la lista para usarlo aquí.'
export const CALC_PRODUCT = 'Producto'
export const CALC_UNITS = 'Unidades'
export const CALC_RESULT = 'Equivale a'
export const calcNote = (name: string, kgPerUnit: string) => `${name}: ${kgPerUnit}, en promedio.`

export const TABLE_PRODUCT = 'Producto'
export const TABLE_KG = 'Kg por unidad'
export const tableUnitsHeader = (units: number) => `${String(units)} unidades`
