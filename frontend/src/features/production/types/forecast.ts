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
export const CHECK_COLUMNS = {
  product: 'Producto',
  ordered: 'Pedido',
  expected: 'Pronóstico',
  produced: 'Llegó',
  deviation: 'Desviación',
}
export const DATA_TITLE = 'Con qué datos'
export const MODEL_TITLE = 'Modelo en uso'
export const MODEL_NOTE =
  'Se elige solo: cada vez que se registra producción vuelven a competir sobre los últimos 28 días y se usa el que menos falló.'
export const MODEL_WEIGHT_NOTE =
  'El modelo con peso de la parvada compite cuando hay al menos 45 días con peso anotado.'
export const WEIGHTS_TITLE = 'Peso promedio de la parvada (kg)'
export const WEIGHTS_HINT = 'Peso vivo promedio que se espera de cada tipo. Parte del último anotado en Producción.'
export const WEIGHTS_UNUSED = 'El modelo en uso no toma en cuenta el peso: cambiarlo no mueve el pronóstico por ahora.'
export const DEVIATION_LABEL = 'Desviación'
export const NO_HISTORY_TITLE = 'Todavía no se puede pronosticar'
export const noHistoryBody = (minDays: number) =>
  `Hacen falta al menos ${minDays} días con producción registrada. Regístrala cada día en Producción o carga la historia.`
