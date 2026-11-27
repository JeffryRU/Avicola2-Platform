import type { IsoDate } from '@/shared/domain/dates'
import type { ProjectionChange } from '@/features/history/domain/history'

/** Historial de cambios de las proyecciones (el backend filtra lo que cada uno puede ver). */
export interface HistoryGateway {
  changes(from: IsoDate, to: IsoDate, seller?: string): Promise<ProjectionChange[]>
}
