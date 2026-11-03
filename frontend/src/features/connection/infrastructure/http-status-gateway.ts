import type { StatusGateway } from '@/features/connection/application/ports'
import { dbStatusSchema } from '@/features/connection/domain/schemas'
import type { HttpClient } from '@/shared/application/ports'

export class HttpStatusGateway implements StatusGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  status = () => this.http.get('/status', dbStatusSchema)
}
