/** Estados de una cuenta (calculados en domain/accounts.ts) y su nombre en pantalla. */
export type AccountState = 'active' | 'inactive' | 'locked' | 'must_change'

export const ACCOUNT_STATE_LABEL: Record<AccountState, string> = {
  active: 'Activa',
  must_change: 'Contraseña temporal',
  locked: 'Bloqueada',
  inactive: 'Desactivada',
}
