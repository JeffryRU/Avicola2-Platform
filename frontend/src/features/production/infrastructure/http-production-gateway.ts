import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import type { IsoDate } from '@/shared/domain/dates'
import type { ProductionGateway } from '@/features/production/application/ports'
import { productionDaySchema, type ProductionEntry } from '@/features/production/domain/production'

export class HttpProductionGateway implements ProductionGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  list = (from: IsoDate, to: IsoDate) =>
    this.http.get('/production', z.array(productionDaySchema), { date_from: from, date_to: to })

  register = (day: IsoDate, lines: ProductionEntry[]) =>
    this.http.put(`/production/${day}`, { lines }, productionDaySchema)
}
