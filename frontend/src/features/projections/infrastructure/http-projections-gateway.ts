import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import type { IsoDate } from '@/shared/domain/dates'
import type { DateRange, ProjectionsGateway } from '@/features/projections/application/ports'
import { dailyUnitsSchema, projectionSchema, submissionResultSchema, suggestionSchema, type Submission } from '@/features/projections/domain/schemas'

const rangeQuery = (r: DateRange) => ({ date_from: r.from, date_to: r.to, seller: r.seller })

export class HttpProjectionsGateway implements ProjectionsGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  projections = (r: DateRange) => this.http.get('/projections', z.array(projectionSchema), rangeQuery(r))
  sales = (r: DateRange) => this.http.get('/sales', z.array(dailyUnitsSchema), rangeQuery(r))
  suggestions = (category: string, start: IsoDate, days: number) =>
    this.http.get('/suggestions', suggestionSchema, { category, start, days })

  submit = (s: Submission) =>
    this.http.post(
      '/projections',
      { submission_id: s.submission_id, category: s.category, days: s.days },
      submissionResultSchema,
    )
}
