import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import type { IsoDate } from '@/shared/domain/dates'
import type { StockGateway } from '@/features/stock/application/ports'
import { stockDaySchema, type StockEntry } from '@/features/stock/domain/stock'

export class HttpStockGateway implements StockGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  list = (from: IsoDate, to: IsoDate) =>
    this.http.get('/stock', z.array(stockDaySchema), { date_from: from, date_to: to })

  register = (day: IsoDate, lines: StockEntry[]) => this.http.put(`/stock/${day}`, { lines }, stockDaySchema)
}
