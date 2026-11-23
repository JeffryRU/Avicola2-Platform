import { describe, expect, it } from 'vitest'
import { NO_FILTER, filterProducts, isFiltered } from '@/features/catalog/domain/product-filter'
import type { Product } from '@/shared/domain/products'

const p = (id: string, name: string, kg: number, subcategory: string): Product => ({
  id,
  name,
  kg_per_unit: kg,
  subcategory,
  category: 'BRASA',
  sort_order: 0,
})
const list = [
  p('1', 'Brasa 1', 1.2, 'Brasa chica'),
  p('2', 'Brása 2', 1.6, 'Brasa mediana'),
  p('3', 'Brasa 3', 1.0, 'Brasa chica'),
]

describe('filtro de productos', () => {
  it('sin filtro, todos y en el orden del catálogo', () => {
    expect(filterProducts(list, NO_FILTER).map((x) => x.id)).toEqual(['1', '2', '3'])
    expect(isFiltered(NO_FILTER)).toBe(false)
  })

  it('por tamaño y por nombre (sin distinguir tildes ni mayúsculas)', () => {
    expect(filterProducts(list, { ...NO_FILTER, size: 'Brasa chica' }).map((x) => x.id)).toEqual(['1', '3'])
    expect(filterProducts(list, { ...NO_FILTER, search: 'BRASA 2' }).map((x) => x.id)).toEqual(['2'])
  })

  it('ordena por peso en los dos sentidos', () => {
    expect(filterProducts(list, { ...NO_FILTER, sort: 'light' }).map((x) => x.id)).toEqual(['3', '1', '2'])
    expect(filterProducts(list, { ...NO_FILTER, sort: 'heavy' }).map((x) => x.id)).toEqual(['2', '1', '3'])
    expect(isFiltered({ ...NO_FILTER, sort: 'heavy' })).toBe(true)
  })
})
