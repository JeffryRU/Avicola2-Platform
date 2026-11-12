import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import { endpoints } from '@/shared/infrastructure/api/endpoints'
import type { IsoDate } from '@/shared/domain/dates'
import type { StockGateway } from '@/features/stock/application/ports'
import { stockDaySchema, stockOptionsSchema, type StockEntry } from '@/features/stock/domain/stock'

export class HttpStockGateway implements StockGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  list = (from: IsoDate, to: IsoDate) =>
    this.http.get(endpoints.stock.list, z.array(stockDaySchema), { date_from: from, date_to: to })

  options = () => this.http.get(endpoints.stock.options, stockOptionsSchema)

  register = (day: IsoDate, location: string, lines: StockEntry[]) =>
    this.http.put(endpoints.stock.day(day), { location, lines }, stockDaySchema)
}
