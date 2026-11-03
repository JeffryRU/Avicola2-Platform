import { describe, expect, it } from 'vitest'
import { accountState, newAccountSchema, type AdminAccount } from '@/features/accounts/domain/accounts'
import { ACCOUNT_STATE_LABEL } from '@/features/accounts/types/accounts'

const account = (over: Partial<AdminAccount> = {}): AdminAccount => ({
  username: 'rnavarro',
  name: 'Roberto Navarro',
  zone: 'Trujillo',
  role: 'seller',
  is_active: true,
  must_change_password: false,
  locked_until: null,
  ...over,
})
const NOW = new Date('2026-11-03T10:00:00Z')

describe('cuentas', () => {
  it('calcula el estado: desactivada, bloqueada, contraseña temporal o activa', () => {
    expect(accountState(account({ is_active: false }), NOW)).toBe('inactive')
    expect(accountState(account({ locked_until: '2026-11-03T11:00:00Z' }), NOW)).toBe('locked')
    expect(accountState(account({ locked_until: '2026-11-03T09:00:00Z' }), NOW)).toBe('active')
    expect(accountState(account({ must_change_password: true }), NOW)).toBe('must_change')
    expect(ACCOUNT_STATE_LABEL[accountState(account(), NOW)]).toBe('Activa')
  })

  it('normaliza el formulario de nuevo usuario', () => {
    const v = newAccountSchema.parse({ username: ' EAuleste ', name: 'Estuardo Auleste', zone: '', role: 'seller' })
    expect(v).toEqual({ username: 'eauleste', name: 'Estuardo Auleste', zone: null, role: 'seller' })
    expect(newAccountSchema.safeParse({ username: 'a', name: 'x', zone: '', role: 'seller' }).success).toBe(false)
  })
})
