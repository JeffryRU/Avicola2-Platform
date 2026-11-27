/** Textos de la pantalla de notificaciones: filtro por día (única fuente). */
import type { RangePreset } from '@/features/notifications/domain/notifications'

export const RANGE_LABEL: Record<RangePreset, string> = {
  all: 'Todas',
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Últimos 7 días',
  custom: 'Elegir fechas',
}
export const FILTER_LABEL = 'Mostrar notificaciones de'
export const FROM_LABEL = 'Desde'
export const TO_LABEL = 'Hasta'
export const CLEAR_LABEL = 'Ver todas'
export const EMPTY_RANGE_TITLE = 'No hay notificaciones en esos días'
export const EMPTY_RANGE_BODY = 'Prueba con otras fechas o vuelve a ver todas.'
export const countLabel = (n: number) => (n === 1 ? '1 notificación' : `${String(n)} notificaciones`)
export const TODAY_LABEL = 'Hoy'
export const YESTERDAY_LABEL = 'Ayer'
