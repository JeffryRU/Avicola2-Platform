import { describe, expect, it } from 'vitest'
import { bestPerLevel, type ModelResult } from '@/features/model/domain/model'

const m = (key: string, e: number[]): ModelResult => ({
  key,
  name: key,
  metrics: { detalle: e[0], vendedor_dia: e[1], tamano_dia: e[2], equipo_dia: e[3], equipo_semana: e[4], sesgo: 0 },
})

describe('modelo de demanda', () => {
  it('elige el de menor error en cada nivel', () => {
    const best = bestPerLevel([
      m('actual', [54, 35, 27, 20, 13]),
      m('robusta', [53, 32, 25, 19, 12]),
      m('apilado', [56, 33, 26, 20, 8]),
    ])
    expect(best).toEqual({
      detalle: 'robusta',
      vendedor_dia: 'robusta',
      tamano_dia: 'robusta',
      equipo_dia: 'robusta',
      equipo_semana: 'apilado',
    })
  })
})
