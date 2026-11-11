/** Textos del pronóstico de llegada (única fuente). */
export const FORECAST_TITLE = 'Pronóstico de llegada'
export const FORECAST_NAV_LABEL = 'Pronóstico'
export const FORECAST_SUBTITLE = 'Escribe lo que se pedirá a granja y mira en qué rango llegará.'
export const REQUEST_TITLE = 'Lo que se pedirá a granja'
export const REQUEST_HINT = 'Parte de lo último que se pidió. Cambia las cantidades para probar otro pedido.'
export const RESULT_TITLE = 'Lo que llegará por rango'
export const RESET_LABEL = 'Volver al último pedido'
export const EXPECTED_LABEL = 'Llegarán'
export const QUALITY_A_LABEL = 'Calidad A'
export const QUALITY_B_LABEL = 'Calidad B'
export const TOTAL_LABEL = 'aves llegarán'
export const ACCURACY_TITLE = 'Qué tanto acierta'
export const ACCURACY_MODEL = 'Con el pronóstico'
export const ACCURACY_NAIVE = 'Suponiendo que llega lo pedido'
export const ACCURACY_NOTE =
  'Aves que terminan en otro rango, por cada 100 que llegan. Cada día se pronosticó solo con los días anteriores.'
export const BY_DAY_TITLE = 'Error por día'
export const CHECK_TITLE = 'Pronóstico contra lo que llegó'
export const CHECK_COLUMNS = { product: 'Producto', ordered: 'Pedido', expected: 'Pronóstico', produced: 'Llegó' }
export const DATA_TITLE = 'Con qué datos'
export const METHOD_TEXT = (halfLife: number) =>
  `Promedia cómo se repartió la llegada en los días con registro y le da más peso a lo reciente: un día de hace ${halfLife} registros cuenta la mitad que el último.`
export const NO_HISTORY_TITLE = 'Todavía no se puede pronosticar'
export const noHistoryBody = (minDays: number) =>
  `Hacen falta al menos ${minDays} días con producción registrada. Regístrala cada día en Producción o carga la historia.`
