import type { IsoDate } from '@/shared/domain/dates'
import type { ArrivalForecast } from '@/features/production/domain/forecast'
import type { ProductionDay, ProductionEntry } from '@/features/production/domain/production'

/** Producción diaria (el backend decide quién la ve y quién la registra). */
export interface ProductionGateway {
  list(from: IsoDate, to: IsoDate): Promise<ProductionDay[]>
  forecast(weights?: number[]): Promise<ArrivalForecast>
  register(day: IsoDate, lines: ProductionEntry[], weights: Record<string, number>): Promise<ProductionDay>
}
