/** Estados de una cuenta (calculados en domain/accounts.ts) y su nombre en pantalla. */
export type AccountState = 'active' | 'inactive' | 'locked'

export const ACCOUNT_STATE_LABEL: Record<AccountState, string> = {
  active: 'Activa',
  locked: 'Bloqueada',
  inactive: 'Desactivada',
}
