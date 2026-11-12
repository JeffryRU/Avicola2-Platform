import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import type { IsoDate } from '@/shared/domain/dates'
import type { StockGateway } from '@/features/stock/application/ports'
import { stockDaySchema, stockOptionsSchema, type StockEntry } from '@/features/stock/domain/stock'

export class HttpStockGateway implements StockGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  list = (from: IsoDate, to: IsoDate) =>
    this.http.get('/stock', z.array(stockDaySchema), { date_from: from, date_to: to })

  options = () => this.http.get('/stock/options', stockOptionsSchema)

  register = (day: IsoDate, location: string, lines: StockEntry[]) =>
    this.http.put(`/stock/${day}`, { location, lines }, stockDaySchema)
}
