import { z } from 'zod'
import { addDays, type IsoDate } from '@/shared/domain/dates'
import { isoDateSchema } from '@/shared/domain/schemas'

/** Forma de cálculo: «sum» = proyección + pedidos (la del negocio); «max» = el mayor de los dos. */
export const SACA_METHODS = ['sum', 'max'] as const
export const DEFAULT_METHOD = 'sum'
export const sacaMethodSchema = z.enum(SACA_METHODS)
export type SacaMethod = z.infer<typeof sacaMethodSchema>

const METHOD_KEY = 'saca.method'
/** La forma elegida se recuerda en este equipo. */
export function storedMethod(storage: Pick<Storage, 'getItem'> | undefined): SacaMethod {
  const parsed = sacaMethodSchema.safeParse(storage?.getItem(METHOD_KEY))
  return parsed.success ? parsed.data : DEFAULT_METHOD
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

export const sacaGroupSchema = z.object({
  name: z.string(),
  projected: z.number().int(),
  ordered: z.number().int(),
  demand: z.number().int(),
  stock: z.number().int(),
  need: z.number().int(),
  factor: z.number(),
  farm_order: z.number().int(),
})
export type SacaGroup = z.infer<typeof sacaGroupSchema>

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
  method: sacaMethodSchema.default(DEFAULT_METHOD),
  // Pedido final a granja: por tipo, lo que hace falta por su factor.
  farm_order: z.number().int(),
  // Stock de calidad B (descuenta por tipo) y stock en lotes antiguos (no se descuenta).
  stock_b: z.number().int().default(0),
  stock_old: z.number().int().default(0),
  stock_lot_days: z.number().int().nullish(),
  groups: z.array(sacaGroupSchema),
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

export const MAX_FACTOR = 2
/** Factores escritos por el supervisor (texto) → números; null si alguno no es válido. */
export function parseFactors(draft: Record<string, string>): Record<string, number> | null {
  const out: Record<string, number> = {}
  for (const [name, raw] of Object.entries(draft)) {
    const text = raw.trim().replace(',', '.')
    if (!/^\d+(\.\d+)?$/.test(text)) return null
    const value = Number(text)
    if (value > MAX_FACTOR) return null
    out[name] = value
  }
  return out
}

/** Saca en cero para dibujar la pantalla mientras el servidor no responde. */
export function emptySaca(
  day: IsoDate,
  method: SacaMethod,
  products: { id: string; subcategory?: string | null; category: string }[],
): Saca {
  const line = (id: string) => ({
    product_id: id,
    projected: 0,
    ordered: 0,
    demand: 0,
    stock: 0,
    request: 0,
    request_kg: 0,
    expected: null,
    expected_a: null,
  })
  const groups = [...new Set(products.map((p) => p.subcategory ?? p.category))]
  return {
    date: day,
    lines: products.map((p) => line(p.id)),
    projected: 0,
    ordered: 0,
    demand: 0,
    stock: 0,
    request: 0,
    request_kg: 0,
    live_kg: 0,
    yield_factor: 0.75,
    method,
    farm_order: 0,
    stock_b: 0,
    stock_old: 0,
    stock_lot_days: null,
    groups: groups.map((name) => ({
      name,
      projected: 0,
      ordered: 0,
      demand: 0,
      stock: 0,
      need: 0,
      factor: 1,
      farm_order: 0,
    })),
    stock_date: null,
    sellers_registered: 0,
    sellers_total: 0,
    orders_available: false,
    forecast: null,
  }
}

/** Días que se pueden consultar: desde ayer hasta una semana adelante (por defecto, mañana). */
export const sacaDays = (ref: IsoDate): IsoDate[] => Array.from({ length: 9 }, (_, i) => addDays(ref, i - 1))

/** Vendedores que aún no registraron su proyección del día (el cálculo queda corto sin ellos). */
export const missingSellers = (s: Saca) => Math.max(0, s.sellers_total - s.sellers_registered)
