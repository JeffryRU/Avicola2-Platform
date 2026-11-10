/** Textos del stock de despacho (única fuente). */
export const STOCK_TITLE = 'Stock de despacho'
export const STOCK_SUBTITLE_MANAGE = 'Registra lo que quedó en despacho: unidades y kg por producto y por día.'
export const STOCK_SUBTITLE_VIEW = 'Lo que quedó en despacho cada día, registrado por el jefe de despacho.'
export const DAY_LABEL = 'Día'
export const TODAY_LABEL = 'Hoy'
export const REGISTERED_LABEL = 'registrado'
export const SAVE_LABEL = 'Guardar stock'
export const UPDATE_LABEL = 'Guardar corrección'
export const SAVED_MESSAGE = 'Stock guardado.'
export const NOT_REGISTERED_LABEL = 'Aún no se registró el stock de este día.'
export const READ_ONLY_DAY_LABEL = 'Este día ya no se puede corregir: solo los últimos 7 días.'
export const INVALID_KG_LABEL = 'Revisa los kg: usa números con hasta dos decimales.'
export const KG_HINT = 'Si dejas los kg vacíos, se calculan con el peso promedio del producto.'
export const RECORDED_TITLE = 'Stock registrado'
export const RECORDED_EMPTY = 'No hay stock registrado en los últimos 30 días.'
export const HISTORY_DAYS = 30

export const COLUMNS = {
  product: 'Producto',
  weight: 'Peso prom.',
  units: 'Unidades',
  kg: 'Kg',
  day: 'Día',
  who: 'Registró',
  when: 'Cuándo',
  total: 'Total',
} as const
