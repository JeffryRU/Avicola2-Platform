import type { HttpClient } from '@/core/application/ports'
import type { AuthGateway } from '@/modules/auth/application/ports'
import { sessionSchema } from '@/modules/auth/domain/session'

export class HttpAuthGateway implements AuthGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  login(username: string, password: string) {
    return this.http.post('/auth/login', { username, password }, sessionSchema)
  }
}
