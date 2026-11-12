/** Textos del cálculo de saca (única fuente). */
export const SACA_TITLE = 'Cálculo de saca'
export const SACA_SUBTITLE = 'Cuánto pedir a granja cada día, por producto.'
export const DAY_LABEL = 'Día del cálculo'
export const TODAY_LABEL = 'Hoy'
export const TOMORROW_LABEL = 'Mañana'
export const HERO_LABEL = 'Pedido final a granja'
export const BIRDS_LABEL = 'aves'
export const KG_LABEL = 'kg de producto'
export const LIVE_LABEL = 'kg vivos estimados'
export const BY_PRODUCT_TITLE = 'Por producto'
export const NOTHING_TITLE = 'Nada que pedir todavía'
export const NOTHING_BODY = 'No hay stock, pedidos de mañana, proyecciones de pasado mañana ni plus para este cálculo.'
export const FORMULA =
  'Pedir a granja = stock − pedidos de mañana + proyección de pasado mañana + plus. Nunca menos de 0.'
export const FARM_ORDER_HINT =
  'A granja se pide por tipo: se suman el stock, los pedidos y la proyección de sus productos, y se agrega el plus del tipo. Aunque no haya proyecciones, el plus solo ya puede pedir aves.'
export const stockAt = (d: string) => `Stock al ${d}`
export const NO_STOCK_DATE = 'Sin stock registrado'
export const ordersOf = (d: string) => `Pedidos del ${d}`
export const projectionOf = (d: string) => `Proyección del ${d}`
export const FARM_COLUMNS = {
  type: 'Tipo',
  stock: 'Stock',
  ordered: '− Pedidos (mañana)',
  projected: '+ Proyección (pasado mañana)',
  plus: '+ Plus',
  order: '= Pedir a granja',
} as const
export const EDIT_PLUS_LABEL = 'Cambiar el plus de cada tipo'
export const PLUS_SAVED = 'Plus guardado.'
export const PLUS_INVALID = 'Escribe un número entero entre 0 y 100 000 en cada tipo (por ejemplo 4000).'
export const SAVE_PLUS = 'Guardar'
export const CANCEL = 'Cancelar'
export const NEED_LABEL = 'aves según los productos'
export const groupStockBNote = (n: number) => `incl. ${n.toLocaleString('es-PE')} en B`

/** Panel "Con qué datos se calculó". */
export const SOURCES_TITLE = 'Con qué datos se calculó'
export const SOURCE = {
  projections: 'Proyecciones de pasado mañana',
  stock: 'Stock de despacho (hasta hoy)',
  orders: 'Pedidos de mañana',
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
export const stockBNote = (n: number) =>
  `Además, ${n.toLocaleString('es-PE')} de calidad B, que se suman al stock de su tipo.`
export const stockOldNote = (n: number, days: number) =>
  `No se cuentan ${n.toLocaleString('es-PE')} unid. de lotes de más de ${String(days)} días (se trozan).`
export const NO_STOCK = 'Sin registro de stock entre anteayer y hoy: se toma como 0.'
export const NO_ORDERS = 'No hay pedidos de ARIS cargados para mañana: se toman como 0.'
export const ORDERS_OK = 'Pedidos de ARIS cargados para mañana (pollo entero para brasa).'

export const COLUMNS = {
  product: 'Producto',
  stock: 'Stock',
  ordered: 'Pedidos',
  projected: 'Proyección',
  request: 'Resultado',
  expected: 'Llegará',
  expectedA: 'Calidad A',
  expectedB: 'Calidad B',
  kg: 'Kg',
  total: 'Total',
} as const

export const coverageText = (registered: number, total: number) =>
  `${String(registered)} de ${String(total)} ${total === 1 ? 'vendedor' : 'vendedores'}`

export const missingNote = (n: number) =>
  n === 1
    ? 'Falta 1 vendedor: la proyección puede quedar corta.'
    : `Faltan ${String(n)}: la proyección puede quedar corta.`
