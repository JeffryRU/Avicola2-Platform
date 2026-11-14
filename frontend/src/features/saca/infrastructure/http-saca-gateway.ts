import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import { endpoints } from '@/shared/infrastructure/api/endpoints'
import type { IsoDate } from '@/shared/domain/dates'
import type { SacaGateway } from '@/features/saca/application/ports'
import { sacaSchema } from '@/features/saca/domain/saca'

const plusSchema = z.object({ plus: z.record(z.string(), z.number()) })

export class HttpSacaGateway implements SacaGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  setPlus = async (plus: Record<string, number>) =>
    (await this.http.put(endpoints.saca.plus, { plus }, plusSchema)).plus

  plan = (day: IsoDate) => this.http.get(endpoints.saca.plan, sacaSchema, { date: day })
}
