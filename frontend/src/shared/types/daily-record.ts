import { NOT_REGISTERED, TODAY_LABEL, TOMORROW_LABEL, YESTERDAY_LABEL } from '@/shared/types/labels'

/**
 * Textos comunes de las pantallas que registran lo que pasó cada día (stock de despacho y
 * producción): la tira de días, el resumen y los últimos registros. Única fuente.
 */
export { TODAY_LABEL, TOMORROW_LABEL, YESTERDAY_LABEL }
export const REGISTERED_LABEL = 'con registro'
export const UPDATE_LABEL = 'Guardar corrección'
export const NOT_REGISTERED_TITLE = 'Sin registro'
export const SUMMARY_TITLE = 'Resumen del día'
export const STATUS_SAVED = 'Registrado'
export const STATUS_PENDING = NOT_REGISTERED
export const STATUS_EDITING = 'Con cambios sin guardar'
export const RECORDED_TITLE = 'Últimos registros'

/** Días hacia atrás que muestra la lista de últimos registros. */
export const HISTORY_DAYS = 30
export const RECORDED_EMPTY = `Todavía no hay registros en los últimos ${String(HISTORY_DAYS)} días.`

/** "Solo se corrigen los últimos 7 días." */
export const readOnlyDayLabel = (backDays: number) => `Solo se corrigen los últimos ${String(backDays)} días.`
