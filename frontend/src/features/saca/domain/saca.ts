import { z } from 'zod'
import { addDays, type IsoDate } from '@/shared/domain/dates'
import { isoDateSchema } from '@/shared/domain/schemas'

/** Forma de cálculo: «max» = el mayor entre proyección y pedidos; «sum» = proyección + pedidos. */
export const SACA_METHODS = ['max', 'sum'] as const
export const sacaMethodSchema = z.enum(SACA_METHODS)
export type SacaMethod = z.infer<typeof sacaMethodSchema>

const METHOD_KEY = 'saca.method'
/** La forma elegida se recuerda en este equipo. */
export function storedMethod(storage: Pick<Storage, 'getItem'> | undefined): SacaMethod {
  const parsed = sacaMethodSchema.safeParse(storage?.getItem(METHOD_KEY))
  return parsed.success ? parsed.data : 'max'
}
export const storeMethod = (storage: Pick<Storage, 'setItem'> | undefined, method: SacaMethod) =>
  storage?.setItem(METHOD_KEY, method)

/** Cálculo de saca de un día: lo resuelve el backend; aquí solo se valida y se describe. */
export const sacaLineSchema = z.object({
  product_id: z.string(),
  projected: z.number().int(),
  ordered: z.number().int(),
  demand: z.number().int(),
  stock: z.number().int(),
  request: z.number().int(),
  request_kg: z.number(),
  // Aves que se espera que lleguen en este rango y cuántas en calidad A (null: sin historia).
  expected: z.number().int().nullish(),
  expected_a: z.number().int().nullish(),
})
export type SacaLine = z.infer<typeof sacaLineSchema>

export const sacaSchema = z.object({
  date: isoDateSchema,
  lines: z.array(sacaLineSchema),
  projected: z.number().int(),
  ordered: z.number().int(),
  demand: z.number().int(),
  stock: z.number().int(),
  request: z.number().int(),
  request_kg: z.number(),
  live_kg: z.number(),
  yield_factor: z.number(),
  method: sacaMethodSchema.default('max'),
  stock_date: isoDateSchema.nullable(),
  sellers_registered: z.number().int(),
  sellers_total: z.number().int(),
  orders_available: z.boolean(),
  // Con qué se estimó la llegada por rango (null: falta historia de producción).
  forecast: z
    .object({ method: z.string(), days: z.number().int(), date_from: isoDateSchema, date_to: isoDateSchema })
    .nullish(),
})
export type Saca = z.infer<typeof sacaSchema>

/** Días que se pueden consultar: desde ayer hasta una semana adelante (por defecto, mañana). */
export const sacaDays = (ref: IsoDate): IsoDate[] => Array.from({ length: 9 }, (_, i) => addDays(ref, i - 1))

/** Vendedores que aún no registraron su proyección del día (el cálculo queda corto sin ellos). */
export const missingSellers = (s: Saca) => Math.max(0, s.sellers_total - s.sellers_registered)
