import type { HttpClient } from '@/shared/application/ports'
import { endpoints } from '@/shared/infrastructure/api/endpoints'
import type { ModelGateway } from '@/features/model/application/ports'
import { modelSummarySchema } from '@/features/model/domain/model'

export class HttpModelGateway implements ModelGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  summary = () => this.http.get(endpoints.model.summary, modelSummarySchema.nullable())
}
