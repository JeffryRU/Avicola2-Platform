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

export const NOT_REGISTERED = 'Sin registrar'
/** Abreviatura de unidades, para ir después de un número ("12 unid."). */
export const UNITS_SHORT = 'unid.'

/** "1 día" / "3 días". */
export const daysCount = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`
/** "12 unid." */
export const unitsCount = (n: number) => `${nf0(n)} ${UNITS_SHORT}`
/** "12.5 kg" o "12.5 kg (aprox.)". */
export const kgAmount = (kg: number, approx = false) => `${nf1(kg)} kg${approx ? ' (aprox.)' : ''}`
