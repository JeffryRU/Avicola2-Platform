/** Textos del stock de despacho (única fuente). */
export const STOCK_TITLE = 'Stock de despacho'
export const STOCK_SUBTITLE_MANAGE = 'Lo que quedó en despacho al cierre: unidades y kg por producto.'
export const STOCK_SUBTITLE_VIEW = 'Lo que quedó en despacho cada día, registrado por el jefe de despacho.'
export const DAY_LABEL = 'Día del stock'
export const TODAY_LABEL = 'Hoy'
export const YESTERDAY_LABEL = 'Ayer'
export const REGISTERED_LABEL = 'con registro'
export const SAVE_LABEL = 'Guardar stock'
export const UPDATE_LABEL = 'Guardar corrección'
export const SAVED_MESSAGE = 'Stock guardado.'
export const NOT_REGISTERED_TITLE = 'Sin registro'
export const NOT_REGISTERED_BODY = 'Aún no se registró el stock de este día.'
export const READ_ONLY_DAY_LABEL = 'Solo se corrigen los últimos 7 días.'
export const INVALID_KG_LABEL = 'Revisa los kg: usa números con hasta dos decimales.'
export const KG_HINT = 'Deja los kg en blanco y se calculan con el peso promedio.'
export const SUMMARY_TITLE = 'Resumen del día'
export const STATUS_SAVED = 'Registrado'
export const STATUS_PENDING = 'Sin registrar'
export const STATUS_EDITING = 'Con cambios sin guardar'
export const RECORDED_TITLE = 'Últimos registros'
export const RECORDED_EMPTY = 'Todavía no hay registros en los últimos 30 días.'
export const HISTORY_DAYS = 30

export const COLUMNS = {
  product: 'Producto',
  units: 'Unidades',
  kg: 'Kg',
  total: 'Total',
} as const

export const unitsLabel = (n: number) => (n === 1 ? 'unidad' : 'unidades')
