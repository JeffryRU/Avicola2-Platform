import { describe, expect, it } from 'vitest'
import { bySubcategory, Catalog } from '@/features/catalog/domain/catalog'

const catalog = new Catalog([
  { id: 'B2', category: 'BRASA', name: 'Brasa 2', kg_per_unit: 1.5, sort_order: 1 },
  { id: 'B1', category: 'BRASA', name: 'Brasa 1', kg_per_unit: 1.2, sort_order: 0 },
  { id: 'R1', category: 'OTRA', name: 'Otro 1', kg_per_unit: 0.9, sort_order: 2 },
])

describe('catálogo', () => {
  it('ordena por categoría y calcula kg con el peso por unidad', () => {
    expect(catalog.of('BRASA').map((p) => p.id)).toEqual(['B1', 'B2'])
    expect(catalog.categories).toEqual(['BRASA', 'OTRA'])
    expect(catalog.kg({ B1: 10, B2: 2 })).toBeCloseTo(15)
  })

  it('ofrece todas las brasas o un tamaño, y filtra sus productos', () => {
    const p = (id: string, subcategory: string) => ({
      id,
      category: 'BRASA',
      name: id,
      kg_per_unit: 1,
      sort_order: 0,
      subcategory,
    })
    const c = new Catalog([p('P1', 'Brasa chica'), p('P5', 'Brasa mediana'), p('P7', 'Brasa grande')])
    expect(c.choices.map((x) => x.label)).toEqual(['Todas las brasas', 'Brasa chica', 'Brasa mediana', 'Brasa grande'])
    expect(c.of('BRASA', 'Brasa mediana').map((x) => x.id)).toEqual(['P5'])
    expect(c.of('BRASA').length).toBe(3)
    expect(c.label({ category: 'BRASA', subcategory: null })).toBe('Todas las brasas')
    expect(c.detailedLabel({ category: 'BRASA', subcategory: null })).toBe('Todas las brasas (chica, mediana y grande)')
    expect(c.detailedLabel({ category: 'BRASA', subcategory: 'Brasa chica' })).toBe('Brasa chica')
    expect(catalog.choices.map((x) => x.label)).toEqual(['BRASA', 'OTRA'])
  })

  it('agrupa por subcategoría respetando el orden', () => {
    const p = (id: string, subcategory: string | null) => ({
      id,
      category: 'BRASA',
      name: id,
      kg_per_unit: 1,
      sort_order: 0,
      subcategory,
    })
    const groups = bySubcategory([
      p('P1', 'Brasa chica'),
      p('P2', 'Brasa chica'),
      p('P5', 'Brasa mediana'),
      p('P9', null),
    ])
    expect(groups.map((g) => [g.name, g.products.map((x) => x.id)])).toEqual([
      ['Brasa chica', ['P1', 'P2']],
      ['Brasa mediana', ['P5']],
      [null, ['P9']],
    ])
  })

  it('nombra un día según los tamaños con unidades y separa lo elegido de lo demás', () => {
    const p = (id: string, subcategory: string) => ({ id, category: 'BRASA', name: id, kg_per_unit: 1, sort_order: 0, subcategory })
    const c = new Catalog([p('P1', 'Brasa chica'), p('P5', 'Brasa mediana'), p('P7', 'Brasa grande')])
    expect(c.dayLabel('BRASA', { P1: 3 })).toBe('Brasa chica')
    expect(c.dayLabel('BRASA', { P1: 3, P5: 1 })).toBe('Brasa chica y mediana')
    expect(c.dayLabel('BRASA', { P1: 3, P5: 1, P7: 2 })).toBe('Todas las brasas')
    const chica = { category: 'BRASA', subcategory: 'Brasa chica' }
    expect(c.pick({ P1: 3, P5: 1 }, chica)).toEqual({ P1: 3 })
    expect(c.others({ P1: 3, P5: 1 }, chica)).toEqual({ P5: 1 })
  })
})
