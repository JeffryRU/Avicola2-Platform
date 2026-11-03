import type { IsoDate } from '@/core/domain/dates'
import type { Draft } from '@/modules/planning/domain/draft'
import type {
  DailyUnits,
  DbStatus,
  Product,
  Projection,
  Submission,
  SubmissionResult,
  Suggestion,
} from '@/modules/planning/domain/schemas'
import type { Seller } from '@/modules/auth/domain/session'

export interface DateRange {
  from: IsoDate
  to: IsoDate
  seller?: string
}

export interface PlanningGateway {
  status(): Promise<DbStatus>
  catalog(): Promise<Product[]>
  sellers(): Promise<Seller[]>
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

/** Guarda un archivo generado por la app (p. ej. el CSV de proyecciones). */
export interface FileSaver {
  save(fileName: string, content: string): void
}
