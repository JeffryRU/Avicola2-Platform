import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import { endpoints } from '@/shared/infrastructure/api/endpoints'
import type { IsoDate } from '@/shared/domain/dates'
import type { ProductionGateway } from '@/features/production/application/ports'
import { arrivalForecastSchema } from '@/features/production/domain/forecast'
import { productionDaySchema, type ProductionEntry } from '@/features/production/domain/production'

export class HttpProductionGateway implements ProductionGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  list = (from: IsoDate, to: IsoDate) =>
    this.http.get(endpoints.production.list, z.array(productionDaySchema), { date_from: from, date_to: to })

  forecast = (weights: number[] = []) =>
    // ?weight=a&weight=b: una lista se envía repitiendo el parámetro.
    this.http.get(endpoints.production.forecast, arrivalForecastSchema, {
      weight: weights.length ? weights : undefined,
    })

  register = (day: IsoDate, lines: ProductionEntry[], weights: Record<string, number>) =>
    this.http.put(endpoints.production.day(day), { lines, weights }, productionDaySchema)
}
