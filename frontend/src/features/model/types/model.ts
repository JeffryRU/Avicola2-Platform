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
export const SERIES = {
  real: 'Venta real',
  robusta: 'Combinación robusta (en uso)',
  actual: 'Mediana 4 semanas (anterior)',
}
export const VS_BASELINE = (before: number) => `antes ${before.toFixed(1)} %`
export const trainedNote = (when: string, from: string, to: string, sellers: number, teacher: number) =>
  `Entrenado el ${when} con la historia de ARIS del ${from} al ${to}: ${String(sellers)} vendedores principales (el maestro aprende de ${String(teacher)} series). Se reentrena solo cada noche.`
export const EMPTY_TITLE = 'Todavía no hay un modelo entrenado'
export const EMPTY_BODY =
  'Carga la historia de ARIS (cli historia) y entrena con «cli entrenar», o espera al reentrenamiento de la madrugada.'
