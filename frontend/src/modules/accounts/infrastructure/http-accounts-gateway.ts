import { z } from 'zod'
import type { HttpClient } from '@/core/application/ports'
import type { AccountsGateway } from '@/modules/accounts/application/ports'
import { adminAccountSchema, newCredentialsSchema, type NewAccount } from '@/modules/accounts/domain/accounts'

export class HttpAccountsGateway implements AccountsGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  list = () => this.http.get('/admin/accounts', z.array(adminAccountSchema))

  create = (account: NewAccount) => this.http.post('/admin/accounts', account, newCredentialsSchema)

  resetPassword = (username: string) =>
    this.http.post(`/admin/accounts/${encodeURIComponent(username)}/reset-password`, {}, newCredentialsSchema)

  setActive = (username: string, active: boolean) =>
    this.http.patch(`/admin/accounts/${encodeURIComponent(username)}`, { active }, adminAccountSchema)
}
