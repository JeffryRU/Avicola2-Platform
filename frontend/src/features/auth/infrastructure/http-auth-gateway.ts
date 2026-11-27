import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import { endpoints } from '@/shared/infrastructure/api/endpoints'
import type { AuthGateway } from '@/features/auth/application/ports'
import { sessionSchema } from '@/shared/domain/session'
import type { StoredPreferences } from '@/shared/domain/preferences'

/** La respuesta trae solo el perfil; el token llega en la cookie HttpOnly (Set-Cookie). */
export class HttpAuthGateway implements AuthGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  login(username: string, password: string, remember: boolean) {
    return this.http.post(endpoints.auth.login, { username, password, remember }, sessionSchema)
  }

  async logout() {
    await this.http.post(endpoints.auth.logout, {}, z.null())
  }

  me() {
    return this.http.get(endpoints.auth.me, sessionSchema)
  }

  updateProfile(name: string) {
    return this.http.patch(endpoints.auth.profile, { name }, sessionSchema)
  }

  /** Lo que vuelve se sanea en el dominio (fromStored): aquí solo se exige un objeto o null. */
  getPreferences() {
    return this.http.get(endpoints.auth.preferences, z.record(z.string(), z.unknown()).nullable())
  }

  async savePreferences(preferences: StoredPreferences) {
    await this.http.put(endpoints.auth.preferences, preferences, z.unknown())
  }

  changePassword(current: string, next: string, remember: boolean) {
    return this.http.post(
      endpoints.auth.password,
      { current_password: current, new_password: next, remember },
      sessionSchema,
    )
  }
}
