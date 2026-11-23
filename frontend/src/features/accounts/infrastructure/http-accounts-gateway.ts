import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import { endpoints } from '@/shared/infrastructure/api/endpoints'
import type { AccountsGateway } from '@/features/accounts/application/ports'
import { adminAccountSchema, newCredentialsSchema, type AccountEdit, type NewAccount } from '@/features/accounts/domain/accounts'
import type { Role } from '@/shared/domain/session'

export class HttpAccountsGateway implements AccountsGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  list = () => this.http.get(endpoints.accounts.list, z.array(adminAccountSchema))

  create = (account: NewAccount) => this.http.post(endpoints.accounts.list, account, newCredentialsSchema)

  resetPassword = (username: string) =>
    this.http.post(endpoints.accounts.resetPassword(username), {}, newCredentialsSchema)

  edit = (username: string, data: AccountEdit) =>
    this.http.put(endpoints.accounts.account(username), data, adminAccountSchema)

  setActive = (username: string, active: boolean) =>
    this.http.patch(endpoints.accounts.account(username), { active }, adminAccountSchema)

  changeRole = (username: string, role: Role) =>
    this.http.put(endpoints.accounts.role(username), { role }, adminAccountSchema)
}
