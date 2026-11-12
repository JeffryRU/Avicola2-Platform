/** Textos del stock de despacho (única fuente). */
export const STOCK_TITLE = 'Stock de despacho'
export const STOCK_SUBTITLE_MANAGE = 'Lo que quedó en despacho al cierre, por artículo y por lote.'
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
export const SUMMARY_TITLE = 'Resumen del día'
export const STATUS_SAVED = 'Registrado'
export const STATUS_PENDING = 'Sin registrar'
export const STATUS_EDITING = 'Con cambios sin guardar'
export const RECORDED_TITLE = 'Últimos registros'
export const RECORDED_EMPTY = 'Todavía no hay registros en los últimos 30 días.'
export const HISTORY_DAYS = 30

export const FILTERS_TITLE = 'Qué ver'
export const LOCATION_LABEL = 'Ubicación'
export const ALL_LOCATIONS = 'Todas las ubicaciones'
export const TYPE_LABEL = 'Tipo'
export const ALL_TYPES = 'Todos los tipos'
export const QUALITY_LABEL = 'Calidad'
export const QUALITY_OPTION = { ALL: 'A y B juntas', A: 'Solo calidad A', B: 'Solo calidad B' } as const
export const UNIT_LABEL = 'Mostrar en'
export const UNIT_OPTION = { units: 'Unidades', kg: 'Kg', both: 'Unidades y kg' } as const
export const LOTS_LABEL = 'Lotes (fecha de beneficio)'
export const LOTS_HINT = 'Elige los lotes que quieres ver como columnas. Se recuerda en este equipo.'
export const LOT_TODAY = 'del día'
export const lotAgeLabel = (age: number) =>
  age === 0 ? LOT_TODAY : age === 1 ? 'hace 1 día' : `hace ${String(age)} días`
export const lotCountsNote = (days: number) =>
  `Para la saca cuentan los lotes de hasta ${String(days)} días; lo más antiguo se troza y no se descuenta.`
export const OLD_LOT = 'no descuenta'
export const PICK_LOCATION = 'Estás viendo todas las ubicaciones juntas. Elige una ubicación para registrar o corregir.'
export const UNITS_ONLY_HINT = 'Se escriben unidades; los kg se calculan con el peso promedio de cada artículo.'
export const QUALITY_B_TAG = 'Calidad B'
export const BY_LOCATION_TITLE = 'Por ubicación'

export const COLUMNS = {
  product: 'Artículo',
  total: 'Total',
} as const

export const unitsLabel = (n: number) => (n === 1 ? 'unidad' : 'unidades')
