import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addUnits, bySubcategory, productType, sumUnits, type Product, type Units } from '@/shared/domain/products'

const ids = fc.constantFrom('P1', 'P2', 'P3', 'P4')
const units: fc.Arbitrary<Units> = fc.dictionary(ids, fc.nat({ max: 9999 }))

const product = (id: string, subcategory: string | null, category = 'BRASA'): Product => ({
  id,
  category,
  name: id,
  kg_per_unit: 1,
  sort_order: 0,
  subcategory,
})

describe('unidades por producto', () => {
  it('sumar dos conjuntos suma sus totales y cada producto por separado', () => {
    fc.assert(
      fc.property(units, units, (a, b) => {
        const sum = addUnits(a, b)
        expect(sumUnits(sum)).toBe(sumUnits(a) + sumUnits(b))
        for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
          expect(sum[id]).toBe((a[id] ?? 0) + (b[id] ?? 0))
        }
        expect(addUnits(a, b)).toEqual(addUnits(b, a))
      }),
    )
  })

  it('sin datos el total es 0 y addUnits no cambia sus argumentos', () => {
    expect(sumUnits(undefined)).toBe(0)
    const a = { P1: 2 }
    addUnits(a, { P1: 3 })
    expect(a).toEqual({ P1: 2 })
  })
})

describe('tipos y grupos de productos', () => {
  it('el tipo es el tamaño o, si no tiene, la categoría', () => {
    expect(productType(product('P1', 'Brasa chica'))).toBe('Brasa chica')
    expect(productType(product('P2', null, 'Pollo de mercado'))).toBe('Pollo de mercado')
  })

  it('bySubcategory agrupa los consecutivos sin perder ni reordenar productos', () => {
    const subs = fc.constantFrom<string | null>('Brasa chica', 'Brasa grande', null)
    fc.assert(
      fc.property(fc.array(subs, { maxLength: 12 }), (list) => {
        const products = list.map((s, i) => product(`P${String(i)}`, s))
        const groups = bySubcategory(products)
        expect(groups.flatMap((g) => g.products)).toEqual(products)
        for (const g of groups) expect(g.products.every((p) => (p.subcategory ?? null) === g.name)).toBe(true)
        // Dos grupos seguidos nunca tienen el mismo nombre (si no, serían uno).
        const names = groups.map((g) => g.name)
        expect(names.slice(1).every((name, i) => name !== names[i])).toBe(true)
      }),
    )
  })
})
