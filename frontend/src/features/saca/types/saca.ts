/** Textos del cálculo de saca (única fuente). */
export const SACA_TITLE = 'Cálculo de saca'
export const SACA_SUBTITLE = 'Cuánto pedir a granja cada día, por producto.'
export const HISTORY_TITLE = 'Historial de sacas'
export const HISTORY_SUBTITLE = 'La saca de cada día tal como quedó: lo que se pidió a granja, por tipo.'
export const HISTORY_LINK = 'Historial'
export const HISTORY_RANGES = [
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
  { days: 365, label: '1 año' },
] as const
export const HISTORY_EMPTY_TITLE = 'Todavía no hay sacas guardadas'
export const HISTORY_EMPTY_BODY =
  'La saca de cada día se guarda al verla y al cierre de la jornada. Desde hoy se irán sumando aquí.'
export const HISTORY_COLUMNS = { date: 'Día', total: 'Total aves', saved: 'Guardada' } as const
export const savedNote = (time: string, by: string) =>
  `Saca guardada a las ${time}${by === 'sistema' ? ' (cierre del día)' : ` por ${by}`}.`
export const DAY_LABEL = 'Día del cálculo'
export { TODAY_LABEL, TOMORROW_LABEL } from '@/shared/types/labels'
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
  ordered: '− Pedidos',
  projected: '+ Proyec.',
  plus: '+ Plus',
  order: '= Pedir',
} as const
export const EDIT_PLUS_LABEL = 'Cambiar el plus de cada tipo'
export const PLUS_SAVED = 'Plus guardado.'
export const PLUS_INVALID = 'Escribe un número entero entre 0 y 100 000 en cada tipo (por ejemplo 4000).'
export { CANCEL_LABEL as CANCEL, SAVE_LABEL as SAVE_PLUS } from '@/shared/types/labels'
export const NEED_LABEL = 'aves sin contar el plus'
export const groupStockBNote = (n: number) => `+${n.toLocaleString('es-PE')} en B, no cuentan`

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
export const stockBNote = (n: number) =>
  `Además, ${n.toLocaleString('es-PE')} de calidad B: están en el stock, pero en la brasa no se cuentan para la saca.`
export const stockOldNote = (n: number, days: number) =>
  `No se cuentan ${n.toLocaleString('es-PE')} unid. de lotes de más de ${String(days)} días (se trozan).`
export const NO_STOCK = 'Sin registro de stock entre anteayer y hoy: se toma como 0.'
export const NO_ORDERS = 'No hay pedidos de ARIS cargados para mañana: se toman como 0.'
export const ORDERS_OK = 'Pedidos de ARIS cargados para mañana (pollo entero para brasa).'
export const WAITING_SOURCES = 'Esperando los datos del servidor: proyecciones, stock, pedidos y llegada estimada.'

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

/** Enlaces para completar lo que falta. */
export const FIX_PROJECTIONS = 'Ver quién falta'
export const FIX_STOCK = 'Registrar stock'
export const FIX_ARRIVAL = 'Ir a Producción'
