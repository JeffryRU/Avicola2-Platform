import { describe, expect, it } from 'vitest'
import { bestPerLevel, modelSummarySchema, type ModelResult } from '@/features/model/domain/model'

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

describe('resumen del modelo', () => {
  const base = {
    trained_at: '2026-11-23T05:00:00Z',
    data_from: '2026-01-05',
    data_to: '2026-06-13',
    split: {
      entrenamiento: ['2026-02-16', '2026-04-30', 74],
      validacion: ['2026-05-01', '2026-05-16', 16],
      prueba: ['2026-05-17', '2026-06-13', 28],
    },
    sellers: ['ana'],
    series_teacher: 2,
    chosen: { sugerencia: 'robusta', saca: 'destilado', semana: 'apilado' },
    series: [],
  }
  const metrics = { detalle: 1, vendedor_dia: 1, tamano_dia: 1, equipo_dia: 1, equipo_semana: 1, sesgo: 0 }

  it('una corrida anterior (sin detalle) se sigue leyendo', () => {
    const parsed = modelSummarySchema.parse({ ...base, models: [{ key: 'actual', name: 'Mediana', metrics }] })
    expect(parsed.models[0].params).toBeUndefined()
  })

  it('una corrida nueva trae el detalle de cada modelo (sin pedidos de un tamaño: null)', () => {
    const parsed = modelSummarySchema.parse({
      ...base,
      sizes: ['Brasa chica', 'Brasa grande'],
      features: ['vendedor'],
      models: [
        {
          key: 'tsb',
          name: 'TSB',
          metrics,
          params: { alpha: 0.15, loss: 'poisson' },
          split_metrics: { validacion: metrics, prueba: metrics },
          mae: 2.5,
          rmse: 3.1,
          por_tamano: [null, 5.4],
          matriz: [Array(7).fill(null), [4, 5, 6, 6, 3, 7, null]],
          team: [],
        },
      ],
    })
    expect(parsed.models[0].por_tamano).toEqual([null, 5.4])
    expect(parsed.models[0].params?.alpha).toBe(0.15)
  })
})
