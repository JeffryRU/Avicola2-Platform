import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import type { IsoDate } from '@/shared/domain/dates'
import type { HistoryGateway } from '@/features/history/application/ports'
import { changeSchema } from '@/features/history/domain/history'

export class HttpHistoryGateway implements HistoryGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  changes = (from: IsoDate, to: IsoDate, seller?: string) =>
    this.http.get('/projections/history', z.array(changeSchema), { date_from: from, date_to: to, seller })
}
