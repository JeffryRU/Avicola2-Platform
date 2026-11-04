/** Textos de la tabla «Detalle por producto» (única fuente; las pantallas no los arman). */
import { dFull, type IsoDate } from '@/shared/domain/dates'
import { PERIOD_MAX_DAYS, type PeriodError } from '@/features/dashboards/domain/period'

export type DetailView = 'seller' | 'day'

export const DETAIL_VIEW_LABEL: Record<DetailView, string> = {
  seller: 'Por vendedor',
  day: 'Por día',
}

export const ALL = 'all'
export const WHOLE_WEEK_LABEL = 'Toda la semana'
export const WHOLE_PERIOD_LABEL = 'Todo el período'
export const ALL_ZONES_LABEL = 'Todas las zonas'
export const NO_ZONE_LABEL = 'Sin zona'
export const SIZE_COLUMN_LABEL = 'Tamaño'
export const PRODUCT_COLUMN_LABEL = 'Producto'
export const TOTAL_UNITS_LABEL = 'Total (unid.)'
export const TOTAL_KG_LABEL = 'Total (kg)'
export const EMPTY_DETAIL_LABEL = 'No hay vendedores para este filtro.'

/** Barra de filtros de los dashboards. */
export const CLEAR_FILTERS_LABEL = 'Limpiar'
export const ALL_SELLERS_LABEL = 'Todos los vendedores'
export const WEEK_FILTER_LABEL = 'Semana'
export const SELLERS_FILTER_LABEL = 'Vendedores'
export const DAY_FILTER_LABEL = 'Día'
export const ZONE_FILTER_LABEL = 'Zona'
export const SIZE_FILTER_LABEL = 'Tamaño'
export const ONLY_MINE_LABEL = 'Solo tus proyecciones'
export const sellersCount = (n: number) => `${String(n)} vendedores`
export const zonesCount = (n: number) => `${String(n)} zonas`
export const sizesCount = (n: number) => `${String(n)} tamaños`

/** Rango personalizado. */
export const CUSTOM_PERIOD_LABEL = 'Personalizado…'
export const CUSTOM_PERIOD_TITLE = 'Rango personalizado'
export const FROM_LABEL = 'Desde'
export const TO_LABEL = 'Hasta'
export const APPLY_LABEL = 'Aplicar'
export const CANCEL_LABEL = 'Cancelar'
export const MISSING_DATES_LABEL = 'Elige las dos fechas.'
export const PERIOD_ERROR: Record<PeriodError, string> = {
  order: 'La fecha «Hasta» debe ser igual o posterior a «Desde».',
  too_long: `El rango puede tener como máximo ${String(PERIOD_MAX_DAYS)} días.`,
  out_of_range: 'Elige fechas dentro del rango permitido.',
}
export const periodHint = (min: IsoDate, max: IsoDate) =>
  `Hasta ${String(PERIOD_MAX_DAYS)} días, entre el ${dFull(min)} y el ${dFull(max)}.`

/** Un filtro activo, mostrado como etiqueta que se quita con la ×. */
export interface FilterChip {
  /** Parámetro de la URL del filtro (lo usa «Limpiar» para quitarlos todos de una vez). */
  key: string
  label: string
  onClear: () => void
}
