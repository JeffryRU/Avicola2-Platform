import { z } from 'zod'
import { parseUnits } from '@/features/stock/domain/stock'

/** Modelo de llegada por rango: de lo que se pide de cada tipo, cuánto llega en cada producto. */
const forecastGroupSchema = z.object({
  name: z.string(),
  last_ordered: z.number(),
  last_weight: z.number().nullish(),
  products: z.array(z.object({ product_id: z.string(), share: z.number(), quality_a_rate: z.number() })),
})
export type ForecastGroup = z.infer<typeof forecastGroupSchema>

export const arrivalForecastSchema = z.object({
  available: z.boolean(),
  // Modelo en uso (lo elige solo el backend) y los que compitieron, con su error reciente.
  method: z.string(),
  candidates: z.array(z.object({ name: z.string(), error: z.number() })).default([]),
  weights_used: z.record(z.string(), z.number()).default({}),
  min_days: z.number().int(),
  days: z.number().int(),
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
  groups: z.array(forecastGroupSchema),
  accuracy: z
    .object({
      days: z.number().int(),
      error: z.number(),
      naive_error: z.number(),
      by_day: z.array(z.object({ date: z.string(), error: z.number(), naive_error: z.number() })),
      by_product: z.array(
        z.object({ product_id: z.string(), ordered: z.number(), expected: z.number(), produced: z.number() }),
      ),
    })
    .nullable(),
})
export type ArrivalForecast = z.infer<typeof arrivalForecastSchema>

/** Lo que la persona piensa pedir de cada tipo (texto; vacío = 0). */
export type RequestDraft = Record<string, string>

export const requestDraftOf = (groups: ForecastGroup[]): RequestDraft =>
  Object.fromEntries(groups.map((g) => [g.name, g.last_ordered ? String(Math.round(g.last_ordered)) : '']))

export interface ProjectedLine {
  product_id: string
  expected: number
  expectedA: number
  expectedB: number
}
export interface ProjectedGroup {
  name: string
  requested: number
  expected: number
  lines: ProjectedLine[]
}

/** Proyecta qué llegará por producto si se pide a granja lo indicado en cada tipo. */
export function project(groups: ForecastGroup[], draft: RequestDraft): ProjectedGroup[] {
  return groups.map((g) => {
    const requested = parseUnits(draft[g.name] ?? '') ?? 0
    const lines = g.products.map((p) => {
      const expected = Math.round(requested * p.share)
      const expectedA = Math.round(requested * p.share * p.quality_a_rate)
      return { product_id: p.product_id, expected, expectedA, expectedB: expected - expectedA }
    })
    return { name: g.name, requested, expected: lines.reduce((s, l) => s + l.expected, 0), lines }
  })
}

export function projectionTotals(groups: ProjectedGroup[]) {
  const lines = groups.flatMap((g) => g.lines)
  const expected = lines.reduce((s, l) => s + l.expected, 0)
  const expectedA = lines.reduce((s, l) => s + l.expectedA, 0)
  return {
    requested: groups.reduce((s, g) => s + g.requested, 0),
    expected,
    expectedA,
    expectedB: expected - expectedA,
    aShare: expected ? expectedA / expected : 0,
    largest: Math.max(0, ...lines.map((l) => l.expected)),
  }
}
