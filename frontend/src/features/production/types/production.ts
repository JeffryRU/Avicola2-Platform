/** Textos de la producción diaria (única fuente). */
import type { Field } from '@/features/production/domain/production'

export const PRODUCTION_TITLE = 'Producción'
export const PRODUCTION_SUBTITLE_MANAGE = 'Lo que se pidió a granja y lo que llegó, por producto.'
export const PRODUCTION_SUBTITLE_VIEW =
  'Lo pedido a granja y lo que llegó cada día, registrado por el jefe de despacho.'
export const DAY_LABEL = 'Día de la producción'
export const SAVE_LABEL = 'Guardar producción'
export const SAVED_MESSAGE = 'Producción guardada.'
export const NOT_REGISTERED_BODY = 'Aún no se registró la producción de este día.'
export const HINT = 'Calidad A se calcula sola: lo que llegó menos la calidad B. Lo que dejes en blanco cuenta como 0.'
export const STEPS_TITLE = 'Cómo registrar el día'
export const STEPS = [
  { title: 'Pedido', body: 'Aves que se pidieron a granja de cada rango.' },
  { title: 'Llegó', body: 'Aves que llegaron de verdad en ese rango.' },
  { title: 'Calidad B', body: 'De las que llegaron, cuántas salieron de segunda. No puede pasar de lo que llegó.' },
]
export const STEPS_END = 'Al terminar toca «Guardar producción». Puedes corregir el día después.'
export const TOTALS_ROW_LABEL = 'Total del día'

export const FIELD_LABEL: Record<Field, string> = { ordered: 'Pedido', produced: 'Llegó', quality_b: 'Calidad B' }
export const FIELD_SHORT: Record<Field, string> = { ordered: 'Pedido', produced: 'Llegó', quality_b: 'Cal. B' }
export const PRODUCT_LABEL = 'Producto'
export const DEVIATION_LABEL = 'Desviación'
export const DEVIATION_HINT = 'Desviación = lo que llegó menos lo pedido, en cada rango.'
export const WEIGHTS_TITLE = 'Peso promedio de la parvada (kg)'
export const WEIGHTS_HINT = 'Peso vivo promedio de cada tipo. Es opcional; ayuda al pronóstico de llegada.'
export const weightError = (groups: string[]) => `El peso promedio de ${groups.join(', ')} debe estar entre 0,5 y 6 kg.`

export const qualityError = (names: string[]) => `La calidad B no puede superar lo que llegó en ${names.join(', ')}.`

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
