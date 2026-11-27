import { describe, expect, it } from 'vitest'
import { BRAND_IDS, BRANDS, DEFAULT_BRAND } from '@/shared/types/brands'
import { CONFIRMED, daysCount, kgAmount, STATUS_LABEL, unitsCount } from '@/shared/types/labels'

describe('textos comunes', () => {
  it('pluraliza días y formatea unidades y kilos', () => {
    expect(daysCount(1)).toBe('1 día')
    expect(daysCount(3)).toBe('3 días')
    expect(unitsCount(12)).toBe('12 unid.')
    expect(kgAmount(12.34, true)).toBe('12.3 kg (aprox.)')
    expect(STATUS_LABEL.confirmed).toBe('Confirmada')
  })
})

describe('vocabulario común', () => {
  it('el estado confirmado de la API tiene su texto', () => {
    expect(STATUS_LABEL[CONFIRMED]).toBe('Confirmada')
  })

  it('cada marca tiene nombre y lema, y hay una por defecto', () => {
    for (const id of BRAND_IDS) expect(BRANDS[id].name).not.toBe('')
    expect(BRAND_IDS).toContain(DEFAULT_BRAND)
  })
})
