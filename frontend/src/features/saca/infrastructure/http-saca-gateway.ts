import type { HttpClient } from '@/shared/application/ports'
import type { IsoDate } from '@/shared/domain/dates'
import type { SacaGateway } from '@/features/saca/application/ports'
import { sacaSchema, type SacaMethod } from '@/features/saca/domain/saca'

export class HttpSacaGateway implements SacaGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  plan = (day: IsoDate, method: SacaMethod) => this.http.get('/saca', sacaSchema, { date: day, method })
}
