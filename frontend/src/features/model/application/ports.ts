import type { ModelSummary } from '@/features/model/domain/model'

/** Resultados del modelo de demanda (solo supervisión). */
export interface ModelGateway {
  /** Última corrida; null si todavía no se entrenó. */
  summary(): Promise<ModelSummary | null>
}
