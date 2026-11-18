/** Textos del stock de despacho (única fuente). */
export const STOCK_TITLE = 'Stock de despacho'
export const STOCK_SUBTITLE_MANAGE = 'Lo que quedó en despacho al cierre, por artículo y por lote.'
export const STOCK_SUBTITLE_VIEW = 'Lo que quedó en despacho cada día, registrado por el jefe de despacho.'
export const DAY_LABEL = 'Día del stock'
export const SAVE_LABEL = 'Guardar stock'
export const SAVED_MESSAGE = 'Stock guardado.'
export const NOT_REGISTERED_BODY = 'Aún no se registró el stock de este día.'

export const LOCATION_LABEL = 'Ubicación'
export const ALL_LOCATIONS = 'Todas las ubicaciones'
export const TYPE_LABEL = 'Tipo de producto'
export const ALL_TYPES = 'Todos (brasa, pollo de mercado, descartes)'
export const QUALITY_LABEL = 'Calidad'
export const QUALITY_OPTION = { ALL: 'Todas', A: 'Solo calidad A', B: 'Solo calidad B', D: 'Solo descartes' } as const
export const UNIT_LABEL = 'Ver cantidades en'
export const UNIT_OPTION = { units: 'Unidades', kg: 'Kg', both: 'Unidades y kg' } as const
export const LOTS_LABEL = 'Lotes: fecha de beneficio (una columna por fecha)'
export const LOTS_HINT =
  'Un lote es la fecha en que se benefició el pollo. Marca las fechas que quieres ver como columnas; se recuerda en este equipo.'
export const LOT_TODAY = 'del día'
export const lotAgeLabel = (age: number) =>
  age === 0 ? LOT_TODAY : age === 1 ? 'hace 1 día' : `hace ${String(age)} días`
export const lotCountsNote = (days: number) =>
  `Para la saca cuentan los lotes de hasta ${String(days)} días; lo más antiguo se troza y no se descuenta.`
export const OLD_LOT = 'no descuenta'
export const PICK_LOCATION = 'Elige una ubicación (primer filtro) para registrar o corregir el stock.'
export const UNITS_ONLY_HINT = 'Se escriben unidades; los kg se calculan con el peso promedio de cada artículo.'
export const QUALITY_B_TAG = 'Calidad B'
export const DISCARD_TAG = 'Descarte · no entra a la saca'
export const REGISTER_STEPS_TITLE = 'Cómo registrar el stock'
export const REGISTER_STEPS = [
  'Elige el día arriba. Por defecto se registra el stock general («Todas las ubicaciones»).',
  'Cada fila es un producto y cada columna un lote (su fecha de beneficio).',
  'Escribe las unidades que quedaron; los kg se calculan solos.',
  'Toca «Guardar stock». Puedes volver a corregirlo hasta 7 días después.',
] as const
/** Los mismos pasos cuando hay una sola ubicación (no se elige). */
export const REGISTER_STEPS_GENERAL = ['Elige el día arriba.', ...REGISTER_STEPS.slice(1)] as const
/** Al registrar con «Todas las ubicaciones»: se guarda el stock general. */
export const GENERAL_STOCK_NOTE =
  'Con «Todas las ubicaciones» se registra el stock general. Elige una ubicación solo si cuentas por ubicación.'
export const BY_LOCATION_TITLE = 'Por ubicación'

export const COLUMNS = {
  product: 'Artículo',
  total: 'Total',
} as const

export const unitsLabel = (n: number) => (n === 1 ? 'unidad' : 'unidades')

// Textos comunes con las otras pantallas de registro diario.
export {
  TODAY_LABEL,
  YESTERDAY_LABEL,
  REGISTERED_LABEL,
  UPDATE_LABEL,
  NOT_REGISTERED_TITLE,
  SUMMARY_TITLE,
  STATUS_SAVED,
  STATUS_PENDING,
  STATUS_EDITING,
  RECORDED_TITLE,
  RECORDED_EMPTY,
  HISTORY_DAYS,
} from '@/shared/types/daily-record'
