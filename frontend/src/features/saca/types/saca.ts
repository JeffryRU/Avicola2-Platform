/** Textos del cálculo de saca (única fuente). */
import type { SacaMethod } from '@/features/saca/domain/saca'

export const SACA_TITLE = 'Cálculo de saca'
export const SACA_SUBTITLE = 'Cuánto pedir a granja cada día, por producto.'
export const DAY_LABEL = 'Día de la saca'
export const TODAY_LABEL = 'Hoy'
export const TOMORROW_LABEL = 'Mañana'
export const HERO_LABEL = 'Pedido final a granja'
export const BIRDS_LABEL = 'aves'
export const KG_LABEL = 'kg de producto'
export const LIVE_LABEL = 'kg vivos estimados'
export const BY_PRODUCT_TITLE = 'Por producto'
export const NOTHING_TITLE = 'Nada que pedir todavía'
export const NOTHING_BODY = 'Nadie registró proyecciones para este día.'
export const METHOD_LABEL = 'Forma de cálculo'
export const METHOD_OPTION: Record<SacaMethod, string> = {
  sum: 'Suma: proyección + pedidos − stock',
  max: 'El mayor entre proyección y pedidos, menos stock',
}
export const FORMULA: Record<SacaMethod, string> = {
  sum: 'Hace falta = proyección + pedidos confirmados − stock. Nunca menos de 0.',
  max: 'Hace falta = el mayor entre proyección y pedidos confirmados, menos el stock. Nunca menos de 0.',
}
export const FARM_ORDER_HINT =
  'A granja se pide por tipo: se suman proyección, pedidos y stock de sus productos, y lo que hace falta se multiplica por el factor del tipo.'
export const FARM_COLUMNS = { type: 'Tipo', need: 'Hace falta', factor: 'Factor', order: 'Pedir' } as const
export const EDIT_FACTORS_LABEL = 'Cambiar por cuánto se multiplica'
export const FACTORS_SAVED = 'Factores guardados.'
export const FACTORS_INVALID = 'Escribe un número entre 0 y 2 en cada tipo (por ejemplo 0,80).'
export const SAVE_FACTORS = 'Guardar'
export const CANCEL = 'Cancelar'
export const NEED_LABEL = 'aves hacen falta'

/** Panel "Con qué datos se calculó". */
export const SOURCES_TITLE = 'Con qué datos se calculó'
export const SOURCE = {
  projections: 'Proyecciones',
  stock: 'Stock de despacho',
  orders: 'Pedidos confirmados',
  arrival: 'Llegada estimada por rango',
} as const
export const NO_ARRIVAL = 'Sin historia de producción suficiente (mínimo 14 días registrados).'
export const ARRIVAL_HINT =
  'A granja se pide por tipo y las aves llegan repartidas entre rangos. «Llegará» reparte lo pedido según la producción reciente (pesan más los últimos días).'
export const arrivalNote = (days: number, from: string, to: string) =>
  `Con ${String(days)} días de producción, del ${from} al ${to}.`
/** Nombre legible del modelo de llegada en uso (lo elige solo el backend). */
export function modelLabel(method: string): string {
  if (method === 'hybrid_weight') return 'Suavizado + árboles con el peso de la parvada'
  const halfLife = /^ewma_(\d+(?:\.\d+)?)$/.exec(method)?.[1]
  return halfLife ? `Suavizado exponencial, vida media ${halfLife} días` : method
}
export const NO_STOCK = 'Sin registro en los 3 días anteriores: no se descuenta nada.'
export const NO_ORDERS = 'No hay pedidos de ARIS cargados para este día: se usan solo las proyecciones.'
export const ORDERS_OK = 'Pedidos de ARIS cargados para este día (pollo entero para brasa).'

export const COLUMNS = {
  product: 'Producto',
  projected: 'Proyección',
  ordered: 'Pedidos',
  stock: 'Stock',
  request: 'Hace falta',
  expected: 'Llegará',
  expectedA: 'Calidad A',
  expectedB: 'Calidad B',
  kg: 'Kg',
  total: 'Total',
} as const

export const coverageText = (registered: number, total: number) =>
  `${String(registered)} de ${String(total)} ${total === 1 ? 'vendedor' : 'vendedores'}`

export const missingNote = (n: number) =>
  n === 1 ? 'Falta 1 vendedor: el pedido puede quedar corto.' : `Faltan ${String(n)}: el pedido puede quedar corto.`
