/** Punto de entrada público de la feature: otras features y app/ importan solo desde aquí (ADR 0008). */
export type { HistoryGateway } from '@/features/history/application/ports'
export type { ProjectionChange } from '@/features/history/domain/history'
export { useHistory } from '@/features/history/ui/hooks'
