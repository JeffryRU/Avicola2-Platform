import type { AdminAccount, NewAccount, NewCredentials } from '@/features/accounts/domain/accounts'

/**
 * Administración de cuentas (solo supervisor). Hoy contra la API propia; cuando la app sea un
 * módulo de ARIS, otro adaptador puede implementar este puerto.
 */
export interface AccountsGateway {
  list(): Promise<AdminAccount[]>
  create(account: NewAccount): Promise<NewCredentials>
  resetPassword(username: string): Promise<NewCredentials>
  setActive(username: string, active: boolean): Promise<AdminAccount>
}
