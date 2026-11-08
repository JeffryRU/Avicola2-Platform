import type { AdminAccount, NewAccount, NewCredentials } from '@/features/accounts/domain/accounts'
import type { Role } from '@/features/auth/domain/session'

/**
 * Administración de cuentas (solo supervisor). Hoy contra la API propia; cuando la app sea un
 * módulo de ARIS, otro adaptador puede implementar este puerto.
 */
export interface AccountsGateway {
  list(): Promise<AdminAccount[]>
  create(account: NewAccount): Promise<NewCredentials>
  resetPassword(username: string): Promise<NewCredentials>
  setActive(username: string, active: boolean): Promise<AdminAccount>
  /** Solo el supervisor general; la cuenta cambiada vuelve a iniciar sesión. */
  changeRole(username: string, role: Role): Promise<AdminAccount>
}
