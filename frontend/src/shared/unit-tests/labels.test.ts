import { describe, expect, it } from 'vitest'
import { daysCount, kgAmount, STATUS_LABEL, unitsCount } from '@/shared/types/labels'

describe('textos comunes', () => {
  it('pluraliza días y formatea unidades y kilos', () => {
    expect(daysCount(1)).toBe('1 día')
    expect(daysCount(3)).toBe('3 días')
    expect(unitsCount(12)).toBe('12 unid.')
    expect(kgAmount(12.34, true)).toBe('12.3 kg (aprox.)')
    expect(STATUS_LABEL.confirmed).toBe('Confirmada')
  })
})
