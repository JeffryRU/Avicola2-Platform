import type { IsoDate } from '@/shared/domain/dates'
import type { ProductionDay, ProductionEntry } from '@/features/production/domain/production'

/** Producción diaria (el backend decide quién la ve y quién la registra). */
export interface ProductionGateway {
  list(from: IsoDate, to: IsoDate): Promise<ProductionDay[]>
  register(day: IsoDate, lines: ProductionEntry[]): Promise<ProductionDay>
}
