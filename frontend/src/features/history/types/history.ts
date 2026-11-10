/** Textos del historial de cambios (única fuente). */
import type { ChangeAction } from '@/features/history/domain/history'

export const HISTORY_TITLE = 'Historial de cambios'
export const HISTORY_SUBTITLE_SELLER = 'Quién creó o modificó tus proyecciones, y cuándo.'
export const HISTORY_SUBTITLE_TEAM = 'Quién creó o modificó las proyecciones del equipo, y cuándo.'
export const NO_CHANGES_LABEL = 'No hay cambios en este período.'
export const AFTER_CUTOFF_LABEL = 'Después del corte'
export const PERIOD_LABEL = 'Período'
export const SELLER_LABEL = 'Vendedor'
export const ALL_SELLERS_LABEL = 'Todos los vendedores'

export const CHANGE_ACTION_LABEL: Record<ChangeAction, string> = {
  created: 'Registró',
  updated: 'Modificó',
}

/** Rangos del filtro de período (días hacia atrás desde hoy). */
export const HISTORY_RANGES = [
  { days: 7, label: 'Últimos 7 días' },
  { days: 30, label: 'Últimos 30 días' },
  { days: 90, label: 'Últimos 90 días' },
] as const

export const COLUMNS = {
  when: 'Cuándo',
  seller: 'Vendedor',
  day: 'Día proyectado',
  who: 'Quién',
  action: 'Acción',
  sheet: 'Hoja',
  units: 'Unidades',
  detail: 'Detalle',
} as const

export const unitsChange = (before: number | null, after: number) =>
  before === null ? String(after) : `${String(before)} → ${String(after)}`
