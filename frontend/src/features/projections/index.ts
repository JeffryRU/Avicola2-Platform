/** Punto de entrada público de la feature: otras features y app/ importan solo desde aquí (ADR 0008). */
export type {
  DateRange,
  DraftRepository,
  ProjectionsGateway,
  SubmissionQueue,
} from '@/features/projections/application/ports'
export { periodAgg, versusReal } from '@/features/projections/domain/aggregation'
export type { DailyUnits, Projection } from '@/features/projections/domain/schemas'
export {
  dataWindow,
  useFlushQueue,
  useMyDays,
  useQueue,
  useRangeData,
  useWindowData,
} from '@/features/projections/ui/hooks'
