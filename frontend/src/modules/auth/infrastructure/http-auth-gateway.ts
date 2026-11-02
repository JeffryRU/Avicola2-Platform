import { z } from 'zod'
import type { HttpClient } from '@/core/application/ports'
import type { AuthGateway } from '@/modules/auth/application/ports'
import { sessionSchema } from '@/modules/auth/domain/session'

/** La respuesta trae solo el perfil; el token llega en la cookie HttpOnly (Set-Cookie). */
export class HttpAuthGateway implements AuthGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  login(username: string, password: string, remember: boolean) {
    return this.http.post('/auth/login', { username, password, remember }, sessionSchema)
  }

  async logout() {
    await this.http.post('/auth/logout', {}, z.null())
  }

  me() {
    return this.http.get('/auth/me', sessionSchema)
  }

  changePassword(current: string, next: string, remember: boolean) {
    return this.http.post('/auth/password', { current_password: current, new_password: next, remember }, sessionSchema)
  }
}
