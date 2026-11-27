/** Textos de la pantalla «Modelo de demanda» (única fuente). */
import type { Level } from '@/features/model/domain/model'

export const MODEL_TITLE = 'Modelo de demanda'
export const MODEL_SUBTITLE = 'Qué modelo se usa en cada lugar y cuánto se equivoca en días que no vio.'
export const LEVEL_LABEL: Record<Level, string> = {
  detalle: 'Vendedor × producto × día',
  vendedor_dia: 'Vendedor × día',
  tamano_dia: 'Tamaño × día',
  equipo_dia: 'Equipo × día',
  equipo_semana: 'Equipo × semana',
}
export const USES = [
  {
    key: 'sugerencia',
    title: 'Sugerencia a cada vendedor',
    level: 'vendedor_dia',
    where: 'Nueva proyección y línea «Modelo»',
  },
  { key: 'saca', title: 'Saca por tamaño', level: 'tamano_dia', where: 'Brasa chica, mediana y grande por día' },
  { key: 'semana', title: 'Planificación semanal', level: 'equipo_semana', where: 'Total del equipo por semana' },
] as const
export const BASELINE_KEY = 'actual'
export const SPLIT_LABEL = { entrenamiento: 'Entrenamiento', validacion: 'Validación', prueba: 'Prueba' } as const
export const SPLIT_TITLE = 'División temporal (70 / 15 / 15)'
export const SPLIT_NOTE =
  'Se corta por fecha, nunca al azar: el modelo aprende con lo más antiguo, se eligen los modelos con validación y el error se mide en días que no vio.'
export const TABLE_TITLE = 'Error de cada modelo (WAPE, menor es mejor)'
export const TABLE_NOTE = 'Medido en validación + prueba. En verde, el mejor de cada nivel; ★, el que usa la app.'
export const BIAS_LABEL = 'Sesgo'
export const MODEL_COLUMN = 'Modelo'
export const CHART_TITLE = 'Predicho frente a real (total del equipo por semana)'
export const SERIES = { real: 'Pedido real', actual: 'Mediana 4 semanas (anterior)' }
export const VS_BASELINE = (before: number) => `antes ${before.toFixed(1)} %`
export const trainedNote = (when: string, from: string, to: string, sellers: number, teacher: number) =>
  `Entrenado el ${when} con la historia de ARIS del ${from} al ${to}: ${String(sellers)} vendedores principales (el maestro aprende de ${String(teacher)} series). Se reentrena solo cada noche.`
export const EMPTY_TITLE = 'Todavía no hay un modelo entrenado'
export const EMPTY_BODY =
  'Carga la historia de ARIS (cli historia) y entrena con «cli entrenar», o espera al reentrenamiento de la madrugada.'

/** Detalle de cada modelo (plegables bajo la tabla). */
export const DETAIL_TITLE = 'Detalle de cada modelo'
export const DETAIL_NOTE =
  'Ábrelo para ver sus hiperparámetros, su error por parte, por tamaño y por día, y su predicción.'
export const DETAIL_MISSING =
  'Esta corrida no guardó el detalle. Se verá tras el próximo entrenamiento (cada noche o con «cli entrenar»).'
export const IN_USE = (where: string[]) => `En uso: ${where.join(', ')}`
export const USE_SHORT = { sugerencia: 'sugerencia', saca: 'saca por tamaño', semana: 'plan semanal' } as const
export const DETAIL = {
  mae: 'Error medio (MAE)',
  maeFoot: 'unid. por vendedor y día',
  rmse: 'Error cuadrático (RMSE)',
  rmseFoot: 'castiga los errores grandes',
  bias: 'Sesgo',
  biasFoot: (v: number) => (v > 0 ? 'proyecta de más' : v < 0 ? 'proyecta de menos' : 'sin sesgo'),
  vsBaseline: 'Frente a la mediana',
  vsBaselineFoot: 'vendedor × día (negativo = mejor)',
  splitTitle: 'Error en validación y en prueba (WAPE)',
  splitNote: 'Si en prueba es mucho peor que en validación, el modelo se ajustó de más a lo que vio.',
  level: 'Nivel',
  validation: 'Validación',
  test: 'Prueba',
  total: 'Total',
  matrixTitle: 'Error por tamaño y día de la semana (WAPE)',
  matrixNote: 'Más oscuro, más error. Sirve para ver en qué días y tamaños falla más.',
  size: 'Tamaño',
  sizeTitle: 'Error por tamaño',
  noOrders: 'sin pedidos',
  chartTitle: 'Predicho frente a real (equipo por semana)',
  params: 'Hiperparámetros',
  paramName: 'Parámetro',
  paramValue: 'Valor',
  features: 'Variables que usa',
  featuresNote: 'Lo que mira el boosting de cada vendedor y producto para predecir el día.',
} as const
export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

/** Qué hace cada modelo, en simple. */
export const MODEL_DESCRIPTION: Record<string, string> = {
  actual:
    'La mediana de lo pedido los últimos 4 días iguales de la semana. Es la referencia: todo se compara contra ella.',
  suavizado: 'Promedio de los mismos días de la semana de las últimas 12 semanas, dando más peso a lo reciente.',
  tsb: 'Para demanda intermitente: estima por separado la probabilidad de que haya pedido y su tamaño, y los actualiza cada semana.',
  sba: 'Croston corregido (SBA): estima el tamaño del pedido y cada cuánto se pide, para productos que no se piden todos los días.',
  boosting:
    'Árboles de decisión (gradient boosting, pérdida Poisson) entrenados con los vendedores principales y las variables de abajo.',
  cliente:
    'Suma lo que suele pedir cada cliente que pide ese día de la semana (si pidió al menos la mitad de las veces).',
  maestro: 'El mismo boosting, pero aprende de todas las series (también de los vendedores eventuales): ve más casos.',
  destilado: 'Un alumno que aprende a la vez de lo real y de lo que predice el maestro: más estable con pocos datos.',
  apilado: 'Un alumno que usa la predicción del maestro como una variable más.',
  robusta: 'El promedio de 6 modelos de distinto tipo: rara vez es el mejor, pero casi nunca falla mucho.',
}

/** Nombre en pantalla de cada hiperparámetro (los que no estén, se muestran tal cual). */
export const PARAM_LABEL: Record<string, string> = {
  horizonte_dias: 'Horizonte (días antes)',
  semanas: 'Semanas de historia',
  agregado: 'Cómo combina',
  vida_media_semanas: 'Vida media (semanas)',
  alpha: 'α (suavizado del tamaño)',
  beta: 'β (suavizado de la probabilidad)',
  frecuencia_minima: 'Frecuencia mínima del cliente',
  loss: 'Pérdida',
  learning_rate: 'Tasa de aprendizaje',
  max_leaf_nodes: 'Hojas por árbol (máx.)',
  min_samples_leaf: 'Muestras por hoja (mín.)',
  l2_regularization: 'Regularización L2',
  max_iter: 'Árboles (iteraciones)',
  series: 'Series con que aprende',
  mezcla_real_maestro: 'Peso del maestro',
  bloques_fuera_de_muestra: 'Bloques fuera de muestra',
  modelos: 'Modelos que promedia',
  combina: 'Cuáles',
}
