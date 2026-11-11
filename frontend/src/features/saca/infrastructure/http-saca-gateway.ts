import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import type { IsoDate } from '@/shared/domain/dates'
import type { SacaGateway } from '@/features/saca/application/ports'
import { sacaSchema, type SacaMethod } from '@/features/saca/domain/saca'

const factorsSchema = z.object({ factors: z.record(z.string(), z.number()) })

export class HttpSacaGateway implements SacaGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  setFactors = async (factors: Record<string, number>) =>
    (await this.http.put('/saca/factors', { factors }, factorsSchema)).factors

  plan = (day: IsoDate, method: SacaMethod) => this.http.get('/saca', sacaSchema, { date: day, method })
}
