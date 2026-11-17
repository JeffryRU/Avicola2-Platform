/** Etiquetas de los grupos de días de los gráficos (única fuente). */
import { dDM, dDow, dShort } from '@/shared/domain/dates'
import type { Bucket, Granularity } from '@/features/dashboards/domain/buckets'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export const GRANULARITY_NOTE: Record<Granularity, string | null> = {
  day: null,
  week: 'Período largo: cada punto es una semana.',
  month: 'Período largo: cada punto es un mes.',
}

/** `label` y `sublabel` van bajo el eje; `title`, en el detalle al pasar el mouse. */
export function bucketLabels(b: Bucket, g: Granularity): { label: string; sublabel: string; title: string } {
  if (g === 'day') return { label: dDow(b.start), sublabel: dDM(b.start), title: dShort(b.start) }
  if (g === 'week') return { label: 'Sem.', sublabel: dDM(b.start), title: `Semana del ${dShort(b.start)}` }
  const month = MONTHS[Number(b.start.slice(5, 7)) - 1]
  return { label: month, sublabel: b.start.slice(0, 4), title: `${month} ${b.start.slice(0, 4)}` }
}
