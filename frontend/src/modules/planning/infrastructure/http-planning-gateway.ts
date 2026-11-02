import { z } from 'zod'
import type { HttpClient } from '@/core/application/ports'
import type { IsoDate } from '@/core/domain/dates'
import { sellerSchema } from '@/modules/auth/domain/session'
import type { DateRange, PlanningGateway } from '@/modules/planning/application/ports'
import {
  dailyUnitsSchema,
  dbStatusSchema,
  productSchema,
  projectionSchema,
  submissionResultSchema,
  suggestionSchema,
  type Submission,
} from '@/modules/planning/domain/schemas'

const rangeQuery = (r: DateRange) => ({ date_from: r.from, date_to: r.to, seller: r.seller })

export class HttpPlanningGateway implements PlanningGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  status = () => this.http.get('/status', dbStatusSchema)
  catalog = () => this.http.get('/catalog', z.array(productSchema))
  sellers = () => this.http.get('/sellers', z.array(sellerSchema))
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
