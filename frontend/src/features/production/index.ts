/** Punto de entrada público de la feature: otras features y app/ importan solo desde aquí (ADR 0008). */
export type { ProductionGateway } from '@/features/production/application/ports'
export { emptyForecast } from '@/features/production/domain/forecast'
export { FORECAST_NAV_LABEL, modelLabel } from '@/features/production/types/forecast'
export { PRODUCTION_TITLE } from '@/features/production/types/production'
export { useProduction } from '@/features/production/ui/hooks'
