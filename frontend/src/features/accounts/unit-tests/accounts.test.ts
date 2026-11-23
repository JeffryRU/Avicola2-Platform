import { describe, expect, it } from 'vitest'
import {
  accountState,
  adminAccountSchema,
  editAccountSchema,
  newAccountSchema,
  otherRoles,
  type AdminAccount,
} from '@/features/accounts/domain/accounts'
import { roleName } from '@/shared/types/roles'
import { ACCOUNT_STATE_LABEL } from '@/features/accounts/types/accounts'

const account = (over: Partial<AdminAccount> = {}): AdminAccount => ({
  username: 'rnavarro',
  name: 'Roberto Navarro',
  zone: 'Trujillo',
  role: 'seller',
  is_active: true,
  must_change_password: false,
  locked_until: null,
  can_manage: true,
  assignable_roles: [],
  ...over,
})
const NOW = new Date('2026-11-03T10:00:00Z')

describe('cuentas', () => {
  it('calcula el estado: desactivada, bloqueada o activa (sin cambio de contraseña obligatorio)', () => {
    expect(accountState(account({ is_active: false }), NOW)).toBe('inactive')
    expect(accountState(account({ locked_until: '2026-11-03T11:00:00Z' }), NOW)).toBe('locked')
    expect(accountState(account({ locked_until: '2026-11-03T09:00:00Z' }), NOW)).toBe('active')
    expect(accountState(account({ must_change_password: true }), NOW)).toBe('active')
    expect(ACCOUNT_STATE_LABEL[accountState(account(), NOW)]).toBe('Activa')
  })

  it('normaliza el formulario de nuevo usuario', () => {
    const v = newAccountSchema.parse({ username: ' EAuleste ', name: 'Estuardo Auleste', zone: '', role: 'seller' })
    expect(v).toEqual({ username: 'eauleste', name: 'Estuardo Auleste', zone: null, role: 'seller' })
    expect(newAccountSchema.safeParse({ username: 'a', name: 'x', zone: '', role: 'seller' }).success).toBe(false)
  })

  it('normaliza el formulario de editar usuario y no deja el nombre vacío', () => {
    expect(editAccountSchema.parse({ name: '  Rosa Navarro ', zone: ' ' })).toEqual({ name: 'Rosa Navarro', zone: null })
    expect(editAccountSchema.safeParse({ name: ' ', zone: '' }).success).toBe(false)
  })

  it('solo ofrece cambiar a un rol distinto del actual, y nada si el backend no lo permite', () => {
    expect(otherRoles(account())).toEqual([])
    const all = ['seller', 'supervisor', 'general_supervisor'] as const
    expect(otherRoles(account({ role: 'supervisor', assignable_roles: [...all] }))).toEqual([
      'seller',
      'general_supervisor',
    ])
  })

  it('acepta cuentas de supervisor general', () => {
    expect(newAccountSchema.parse({ username: 'jefa', name: 'Jefa', zone: '', role: 'general_supervisor' }).role).toBe(
      'general_supervisor',
    )
  })

  it('una cuenta con un rol desconocido no rompe la lista (y no ofrece roles desconocidos)', () => {
    const parsed = adminAccountSchema.parse({ ...account(), role: 'admin', assignable_roles: ['seller', 'root'] })
    expect(parsed.role).toBe('admin')
    expect(parsed.assignable_roles).toEqual(['seller'])
    expect(roleName('admin')).toBe('admin')
    expect(roleName('general_supervisor')).toBe('Supervisor general')
  })
})
