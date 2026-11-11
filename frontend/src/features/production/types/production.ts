/** Textos de la producción diaria (única fuente). */
import type { Field } from '@/features/production/domain/production'

export const PRODUCTION_TITLE = 'Producción'
export const PRODUCTION_SUBTITLE_MANAGE = 'Lo que se pidió a granja y lo que llegó, por producto.'
export const PRODUCTION_SUBTITLE_VIEW =
  'Lo pedido a granja y lo que llegó cada día, registrado por el jefe de despacho.'
export const DAY_LABEL = 'Día de la producción'
export const TODAY_LABEL = 'Hoy'
export const YESTERDAY_LABEL = 'Ayer'
export const REGISTERED_LABEL = 'con registro'
export const SAVE_LABEL = 'Guardar producción'
export const UPDATE_LABEL = 'Guardar corrección'
export const SAVED_MESSAGE = 'Producción guardada.'
export const NOT_REGISTERED_TITLE = 'Sin registro'
export const NOT_REGISTERED_BODY = 'Aún no se registró la producción de este día.'
export const READ_ONLY_DAY_LABEL = 'Solo se corrigen los últimos 7 días.'
export const HINT = 'Calidad A se calcula sola: producido menos calidad B. Lo que dejes en blanco cuenta como 0.'
export const SUMMARY_TITLE = 'Resumen del día'
export const STATUS_SAVED = 'Registrado'
export const STATUS_PENDING = 'Sin registrar'
export const STATUS_EDITING = 'Con cambios sin guardar'
export const RECORDED_TITLE = 'Últimos registros'
export const RECORDED_EMPTY = 'Todavía no hay registros en los últimos 30 días.'
export const HISTORY_DAYS = 30

export const FIELD_LABEL: Record<Field, string> = { ordered: 'Pedido', produced: 'Producido', quality_b: 'Calidad B' }
export const FIELD_SHORT: Record<Field, string> = { ordered: 'Pedido', produced: 'Llegó', quality_b: 'Cal. B' }
export const PRODUCT_LABEL = 'Producto'
export const DEVIATION_LABEL = 'Desviación'
export const DEVIATION_HINT = 'Desviación = lo que llegó menos lo pedido, en cada rango.'
export const WEIGHTS_TITLE = 'Peso promedio de la parvada (kg)'
export const WEIGHTS_HINT = 'Peso vivo promedio de cada tipo. Es opcional; ayuda al pronóstico de llegada.'
export const weightError = (groups: string[]) => `El peso promedio de ${groups.join(', ')} debe estar entre 0,5 y 6 kg.`

export const qualityError = (names: string[]) => `La calidad B no puede superar lo producido en ${names.join(', ')}.`
