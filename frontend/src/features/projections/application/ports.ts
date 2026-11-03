import type { IsoDate } from '@/shared/domain/dates'
import type { Draft } from '@/features/projections/domain/draft'
import type {
  DailyUnits,
  Projection,
  Submission,
  SubmissionResult,
  Suggestion,
} from '@/features/projections/domain/schemas'

export interface DateRange {
  from: IsoDate
  to: IsoDate
  seller?: string
}

/** Proyecciones de los vendedores y la venta real con la que se comparan. */
export interface ProjectionsGateway {
  projections(range: DateRange): Promise<Projection[]>
  sales(range: DateRange): Promise<DailyUnits[]>
  suggestions(category: string, start: IsoDate, days: number): Promise<Suggestion>
  submit(submission: Submission): Promise<SubmissionResult>
}

/** Cola de envíos del dispositivo (modo offline). */
export interface SubmissionQueue {
  list(): Submission[]
  put(submission: Submission): void
  remove(submissionId: string): void
  subscribe(listener: () => void): () => void
}

export interface DraftRepository {
  load(): Draft | null
  save(draft: Draft): void
  clear(): void
}
