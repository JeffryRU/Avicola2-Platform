import { describe, expect, it } from 'vitest'
import { emptySaca } from '@/features/saca/domain/saca'
import { emptyForecast } from '@/features/production/domain/forecast'
import { DEFAULT_PRODUCTS } from '@/features/catalog/domain/defaults'

// Sin backend las pantallas se dibujan con estos valores en cero.
describe('pantallas sin datos del servidor', () => {
  it('la saca vacía tiene una fila por producto y todo en cero', () => {
    const s = emptySaca('2026-11-12', 'sum', DEFAULT_PRODUCTS)
    expect(s.lines).toHaveLength(DEFAULT_PRODUCTS.length)
    expect(s.lines.every((l) => l.request === 0 && l.stock === 0)).toBe(true)
    expect(s.farm_order).toBe(0)
    expect(s.groups.map((g) => g.name)).toEqual([...new Set(DEFAULT_PRODUCTS.map((p) => p.subcategory ?? p.category))])
  })

  it('el pronóstico vacío trae los grupos del catálogo sin cifras', () => {
    const f = emptyForecast(DEFAULT_PRODUCTS)
    expect(f.groups.length).toBeGreaterThan(0)
    expect(f.groups.every((g) => g.last_ordered === 0 && g.products.every((p) => p.share === 0))).toBe(true)
    expect(f.candidates).toEqual([])
  })

  it('el catálogo por defecto tiene las brasas 1 a 10', () => {
    expect(DEFAULT_PRODUCTS.filter((p) => p.name.startsWith('Brasa'))).toHaveLength(10)
  })
})
