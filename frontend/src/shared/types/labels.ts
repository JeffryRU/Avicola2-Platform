import { nf0, nf1 } from '@/shared/domain/format'

/** Vocabulario común de la interfaz: todas las pantallas toman de aquí estos textos. */

export const STATUS_LABEL = {
  confirmed: 'Confirmada',
  pending: 'Pendiente',
  synced: 'Sincronizada',
  queued: 'Por sincronizar',
  local: 'En este dispositivo',
} as const
export type StatusKind = keyof typeof STATUS_LABEL

/** Estado de una proyección confirmada, tal como lo envía la API. */
export const CONFIRMED = 'confirmed' satisfies StatusKind

export const NOT_REGISTERED = 'Sin registrar'

/** Acciones comunes. */
export const CANCEL_LABEL = 'Cancelar'
export const SAVE_LABEL = 'Guardar'
export const RETRY_LABEL = 'Reintentar'
export const LOGOUT_LABEL = 'Cerrar sesión'
/** Filtro de vendedores sin elegir ninguno. */
export const ALL_SELLERS_LABEL = 'Todos los vendedores'

/** Días relativos a hoy. */
export const TODAY_LABEL = 'Hoy'
export const TOMORROW_LABEL = 'Mañana'
export const DAY_AFTER_TOMORROW_LABEL = 'Pasado mañana'
export const YESTERDAY_LABEL = 'Ayer'
/** Abreviatura de unidades, para ir después de un número ("12 unid."). */
export const UNITS_SHORT = 'unid.'

/** "1 día" / "3 días". */
export const daysCount = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`
/** "12 unid." */
export const unitsCount = (n: number) => `${nf0(n)} ${UNITS_SHORT}`
/** "12.5 kg" o "12.5 kg (aprox.)". */
export const kgAmount = (kg: number, approx = false) => `${nf1(kg)} kg${approx ? ' (aprox.)' : ''}`

/** Botón de engranaje del menú lateral (lleva a Perfil). */
export const PROFILE_LABEL = 'Perfil, apariencia y accesibilidad'

/** Botón del asistente (chat de IA, solo supervisión). */
export const ASSISTANT_LABEL = 'Asistente'
export const ASSISTANT_TITLE = 'Preguntar al asistente (se abre en otra pestaña)'
