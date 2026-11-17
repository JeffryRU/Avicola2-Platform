import { z } from 'zod'
import { isoDateSchema } from '@/shared/domain/schemas'

/** Niveles en los que se mide el error (WAPE, %), del más fino al más agregado. */
export const LEVELS = ['detalle', 'vendedor_dia', 'tamano_dia', 'equipo_dia', 'equipo_semana'] as const
export type Level = (typeof LEVELS)[number]

const metricsSchema = z.object({
  detalle: z.number(),
  vendedor_dia: z.number(),
  tamano_dia: z.number(),
  equipo_dia: z.number(),
  equipo_semana: z.number(),
  sesgo: z.number(),
})

/** Última corrida del modelo de demanda (GET /model/summary, ADR 0020). */
export const modelSummarySchema = z.object({
  trained_at: z.string(),
  data_from: isoDateSchema,
  data_to: isoDateSchema,
  forecast_dates: z.array(isoDateSchema).default([]),
  split: z.object({
    entrenamiento: z.tuple([isoDateSchema, isoDateSchema, z.number()]),
    validacion: z.tuple([isoDateSchema, isoDateSchema, z.number()]),
    prueba: z.tuple([isoDateSchema, isoDateSchema, z.number()]),
  }),
  sellers: z.array(z.string()),
  series_teacher: z.number(),
  models: z.array(z.object({ key: z.string(), name: z.string(), metrics: metricsSchema })),
  chosen: z.object({ sugerencia: z.string(), saca: z.string(), semana: z.string() }),
  series: z.array(
    z.object({
      date: isoDateSchema,
      real: z.number(),
      actual: z.number(),
      sugerencia: z.number(),
      saca: z.number(),
      semana: z.number(),
    }),
  ),
})
export type ModelSummary = z.infer<typeof modelSummarySchema>
export type ModelResult = ModelSummary['models'][number]

/** El modelo con menor error en cada nivel. */
export function bestPerLevel(models: ModelResult[]): Record<Level, string> {
  const best = {} as Record<Level, string>
  for (const level of LEVELS) {
    const sorted = [...models].sort((a, b) => a.metrics[level] - b.metrics[level])
    best[level] = sorted[0]?.key ?? ''
  }
  return best
}
