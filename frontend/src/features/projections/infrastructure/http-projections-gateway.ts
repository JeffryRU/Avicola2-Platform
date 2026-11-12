import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import { endpoints } from '@/shared/infrastructure/api/endpoints'
import type { IsoDate } from '@/shared/domain/dates'
import type { DateRange, ProjectionsGateway } from '@/features/projections/application/ports'
import {
  dailyUnitsSchema,
  projectionSchema,
  submissionResultSchema,
  suggestionSchema,
  type Submission,
} from '@/features/projections/domain/schemas'

const rangeQuery = (r: DateRange) => ({ date_from: r.from, date_to: r.to, seller: r.seller })

export class HttpProjectionsGateway implements ProjectionsGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  projections = (r: DateRange) => this.http.get(endpoints.projections.list, z.array(projectionSchema), rangeQuery(r))
  sales = (r: DateRange) => this.http.get(endpoints.sales.list, z.array(dailyUnitsSchema), rangeQuery(r))
  suggestions = (category: string, start: IsoDate, days: number, seller?: string) =>
    this.http.get(endpoints.suggestions.get, suggestionSchema, { category, start, days, on_behalf: seller })

  submit = (s: Submission) =>
    this.http.post(
      endpoints.projections.list,
      {
        submission_id: s.submission_id,
        category: s.category,
        days: s.days,
        // El backend solo acepta otro vendedor si quien envía es supervisor.
        ...(s.author && s.author !== s.seller ? { seller: s.seller } : {}),
      },
      submissionResultSchema,
    )
}
