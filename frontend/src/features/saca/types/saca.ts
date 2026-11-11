/** Textos del cálculo de saca (única fuente). */
export const SACA_TITLE = 'Cálculo de saca'
export const SACA_SUBTITLE = 'Cuánto pedir a granja cada día, por producto.'
export const DAY_LABEL = 'Día de la saca'
export const TODAY_LABEL = 'Hoy'
export const TOMORROW_LABEL = 'Mañana'
export const HERO_LABEL = 'Pedir a granja'
export const BIRDS_LABEL = 'aves'
export const KG_LABEL = 'kg de producto'
export const LIVE_LABEL = 'kg vivos estimados'
export const BY_PRODUCT_TITLE = 'Por producto'
export const NOTHING_TITLE = 'Nada que pedir todavía'
export const NOTHING_BODY = 'Nadie registró proyecciones para este día.'
export const FORMULA = 'Pedir = el mayor entre proyección y pedidos confirmados, menos el stock. Nunca menos de 0.'

/** Panel "Con qué datos se calculó". */
export const SOURCES_TITLE = 'Con qué datos se calculó'
export const SOURCE = {
  projections: 'Proyecciones',
  stock: 'Stock de despacho',
  orders: 'Pedidos confirmados',
} as const
export const NO_STOCK = 'Sin registro en los 3 días anteriores: no se descuenta nada.'
export const NO_ORDERS = 'Sin conectar (ARIS aún no se integra): se usan solo las proyecciones.'
export const ORDERS_OK = 'Conectados.'

export const COLUMNS = {
  product: 'Producto',
  projected: 'Proyección',
  ordered: 'Pedidos',
  stock: 'Stock',
  request: 'Pedir',
  kg: 'Kg',
  total: 'Total',
} as const

export const coverageText = (registered: number, total: number) =>
  `${String(registered)} de ${String(total)} ${total === 1 ? 'vendedor' : 'vendedores'}`

export const missingNote = (n: number) =>
  n === 1 ? 'Falta 1 vendedor: el pedido puede quedar corto.' : `Faltan ${String(n)}: el pedido puede quedar corto.`
