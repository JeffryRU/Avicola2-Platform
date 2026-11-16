import { z } from 'zod'
import { addDays, type IsoDate } from '@/shared/domain/dates'
import { isoDateSchema } from '@/shared/domain/schemas'
import { productType } from '@/shared/domain/products'

export const SACA_METHOD = 'stock_orders_projection_plus'

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

/** Por tipo: stock − pedidos de mañana + proyección de pasado mañana + plus (nunca menos de 0). */
export const sacaGroupSchema = z.object({
  name: z.string(),
  stock: z.number().int(),
  // Stock de calidad B: ya está sumado en `stock`.
  stock_b: z.number().int().default(0),
  ordered: z.number().int(),
  projected: z.number().int(),
  plus: z.number().int().default(0),
  // stock − pedidos + proyección (puede ser negativo).
  balance: z.number().int(),
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
  method: z.string().default(SACA_METHOD),
  // Pedidos de mañana (D+1) y proyección de pasado mañana (D+2).
  orders_date: isoDateSchema,
  projection_date: isoDateSchema,
  plus: z.number().int().default(0),
  // Pedido final a granja: suma por tipo de max(0, balance + plus).
  farm_order: z.number().int(),
  // Stock de calidad B (se suma a su tipo) y stock en lotes antiguos (no se descuenta).
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

export const MAX_PLUS = 100_000
/** Plus escrito por el supervisor (texto, admite «4,000» o «4 000») → enteros; null si alguno no es válido. */
export function parsePlus(draft: Record<string, string>): Record<string, number> | null {
  const out: Record<string, number> = {}
  for (const [name, raw] of Object.entries(draft)) {
    const text = raw.trim()
    if (!/^(\d+|\d{1,3}([ ,.\u00a0]\d{3})+)$/.test(text)) return null
    const value = Number(text.replace(/\D/g, ''))
    if (value > MAX_PLUS) return null
    out[name] = value
  }
  return out
}

/** Saca en cero para dibujar la pantalla mientras el servidor no responde. */
export function emptySaca(
  day: IsoDate,
  products: { id: string; subcategory?: string | null; category: string }[],
): Saca {
  const groups = [...new Set(products.map(productType))]
  return {
    date: day,
    lines: products.map((p) => ({
      product_id: p.id,
      projected: 0,
      ordered: 0,
      demand: 0,
      stock: 0,
      request: 0,
      request_kg: 0,
      expected: null,
      expected_a: null,
    })),
    projected: 0,
    ordered: 0,
    demand: 0,
    stock: 0,
    request: 0,
    request_kg: 0,
    live_kg: 0,
    yield_factor: 0.75,
    method: SACA_METHOD,
    orders_date: addDays(day, 1),
    projection_date: addDays(day, 2),
    plus: 0,
    farm_order: 0,
    stock_b: 0,
    stock_old: 0,
    stock_lot_days: null,
    groups: groups.map((name) => ({
      name,
      stock: 0,
      stock_b: 0,
      ordered: 0,
      projected: 0,
      plus: 0,
      balance: 0,
      farm_order: 0,
    })),
    stock_date: null,
    sellers_registered: 0,
    sellers_total: 0,
    orders_available: false,
    forecast: null,
  }
}

/** Días del cálculo que se pueden consultar: desde ayer hasta una semana adelante (por defecto, hoy). */
export const sacaDays = (ref: IsoDate): IsoDate[] => Array.from({ length: 9 }, (_, i) => addDays(ref, i - 1))

/** Vendedores que aún no registraron su proyección del día (el cálculo queda corto sin ellos). */
export const missingSellers = (s: Saca) => Math.max(0, s.sellers_total - s.sellers_registered)
