/** Textos del cálculo de saca (única fuente). */
export const SACA_TITLE = 'Cálculo de saca'
export const SACA_SUBTITLE = 'Cuánto pedir a granja: lo proyectado o lo pedido (el mayor), menos el stock de despacho.'
export const DAY_LABEL = 'Día de la saca'
export const TODAY_LABEL = 'Hoy'
export const TOMORROW_LABEL = 'Mañana'
export const FORMULA = 'Pedir = el mayor entre proyección y pedidos confirmados, menos el stock. Nunca menos de 0.'
export const NO_ORDERS_NOTE =
  'Aún no hay pedidos confirmados conectados (ARIS no está integrado): el cálculo usa solo las proyecciones.'
export const NO_STOCK_NOTE = 'No hay stock de despacho registrado en los 3 días anteriores: no se descuenta nada.'
export const NOTHING_NOTE = 'Nadie registró proyecciones para este día todavía.'

export const KPI = {
  request: 'Aves a pedir',
  kg: 'Kg de producto',
  live: 'Kg vivos estimados',
  coverage: 'Vendedores con proyección',
} as const

export const COLUMNS = {
  product: 'Producto',
  projected: 'Proyección',
  ordered: 'Pedidos',
  demand: 'Demanda',
  stock: 'Stock',
  request: 'Pedir',
  kg: 'Kg',
  total: 'Total',
} as const

export const missingNote = (n: number) =>
  n === 1
    ? 'Falta la proyección de 1 vendedor: el cálculo puede quedar corto.'
    : `Faltan las proyecciones de ${String(n)} vendedores: el cálculo puede quedar corto.`
