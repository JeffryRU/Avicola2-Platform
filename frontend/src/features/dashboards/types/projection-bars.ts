/** Textos del gráfico de barras de la proyección por día (Estado por día y Resumen semanal). */
export type BarMeasure = 'units' | 'kg'

export const BAR_MEASURE_LABEL: Record<BarMeasure, string> = { units: 'Unidades', kg: 'Kg' }
export const BAR_UNIT: Record<BarMeasure, string> = { units: 'unid.', kg: 'kg' }
export const barsTitle = (base: string, m: BarMeasure) => `${base} (${m === 'units' ? 'unidades' : 'kg'})`
export const BARS_ARIA: Record<BarMeasure, string> = {
  units: 'Unidades proyectadas por día',
  kg: 'Kilos proyectados por día',
}
export const BARS_EMPTY_TITLE = 'Sin proyecciones en este período'
export const BARS_EMPTY_BODY = 'Cuando los vendedores registren, verás aquí lo proyectado de cada día.'
export const LEGEND_CONFIRMED = 'Confirmado'
export const LEGEND_PENDING = 'Sin confirmar'
export const BARS_SERIES_NAME = 'Proyección (barras)'
export const MEASURE_GROUP_LABEL = 'Medida del gráfico'
