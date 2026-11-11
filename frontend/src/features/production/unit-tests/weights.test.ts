import { describe, expect, it } from 'vitest'
import { cleanKg, invalidWeights, parseKg, toWeights, weightDraftOf } from '@/features/production/domain/production'
import { storeMethod, storedMethod } from '@/features/saca/domain/saca'
import { modelLabel } from '@/features/saca/types/saca'

describe('peso promedio de la parvada', () => {
  it('parte de lo anotado y deja en blanco lo que falta', () => {
    expect(weightDraftOf(['Brasa chica', 'Brasa grande'], { 'Brasa chica': 1.72 })).toEqual({
      'Brasa chica': '1.72',
      'Brasa grande': '',
    })
  })

  it('acepta coma o punto y envía solo los tipos con peso', () => {
    expect(parseKg('2,33')).toBe(2.33)
    expect(parseKg('abc')).toBeNull()
    expect(toWeights({ 'Brasa chica': '1,72', 'Brasa mediana': '', 'Brasa grande': '2.45' })).toEqual({
      'Brasa chica': 1.72,
      'Brasa grande': 2.45,
    })
  })

  it('señala los pesos fuera de rango y no deja escribir algo que no sea un peso', () => {
    expect(invalidWeights({ a: '0.2', b: '9', c: '2.4', d: '' })).toEqual(['a', 'b'])
    expect(cleanKg('2.345')).toBe('2.345')
    expect(cleanKg('2,3')).toBe('2,3')
    expect(cleanKg('12')).toBeNull()
    expect(cleanKg('2.3456')).toBeNull()
  })
})

describe('forma de cálculo de la saca', () => {
  it('recuerda la elegida y vuelve a la recomendada si no hay nada válido', () => {
    const data = new Map<string, string>()
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
    expect(storedMethod(storage)).toBe('max')
    storeMethod(storage, 'sum')
    expect(storedMethod(storage)).toBe('sum')
    data.set('saca.method', 'otra')
    expect(storedMethod(storage)).toBe('max')
    expect(storedMethod(undefined)).toBe('max')
  })

  it('nombra el modelo de llegada en uso', () => {
    expect(modelLabel('ewma_3')).toBe('Suavizado exponencial, vida media 3 días')
    expect(modelLabel('hybrid_weight')).toContain('peso de la parvada')
  })
})
