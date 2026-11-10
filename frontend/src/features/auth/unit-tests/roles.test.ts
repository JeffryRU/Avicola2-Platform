import { describe, expect, it } from 'vitest'
import { can, hasTeamView, isSupervisor, roleLabel, sessionSchema } from '@/features/auth/domain/session'

const seller = { username: 'rnavarro', name: 'Roberto', zone: 'Trujillo', role: 'seller' } as const

describe('roles y permisos en la sesión', () => {
  it('un perfil guardado antes de los permisos se lee sin permisos (se refresca con /auth/me)', () => {
    const old = sessionSchema.parse({ seller, must_change_password: false })
    expect(old.permissions).toEqual([])
    expect(old.manageable_roles).toEqual([])
  })

  it('ignora permisos y roles que esta versión no conoce', () => {
    const s = sessionSchema.parse({
      seller: { ...seller, role: 'general_supervisor' },
      must_change_password: false,
      permissions: ['view_team', 'borrar_todo'],
      manageable_roles: ['seller', 'admin'],
    })
    expect(s.permissions).toEqual(['view_team'])
    expect(s.manageable_roles).toEqual(['seller'])
    expect(can(s, 'view_team')).toBe(true)
    expect(can(s, 'change_roles')).toBe(false)
  })

  it('rechaza un rol desconocido en el perfil', () => {
    expect(sessionSchema.safeParse({ seller: { ...seller, role: 'admin' }, must_change_password: false }).success).toBe(
      false,
    )
  })

  it('el supervisor general usa la vista de supervisión y tiene su nombre', () => {
    const general = { ...seller, zone: null, role: 'general_supervisor' } as const
    expect(isSupervisor(general)).toBe(true)
    expect(isSupervisor(seller)).toBe(false)
    expect(roleLabel(general)).toBe('Supervisor general')
    expect(roleLabel({ ...seller, role: 'supervisor' })).toBe('Supervisor')
    expect(roleLabel(seller)).toBe('Vendedor, Trujillo')
    expect(roleLabel({ ...seller, zone: null, role: 'dispatch_chief' })).toBe('Jefe de despacho')
  })

  it('la vista de supervisión sale del permiso; sin permisos guardados (perfil viejo), del rol', () => {
    const base = { must_change_password: false, manageable_roles: [] }
    const general = { ...seller, role: 'general_supervisor' } as const
    expect(hasTeamView(sessionSchema.parse({ ...base, seller: general, permissions: ['view_team'] }))).toBe(true)
    expect(hasTeamView(sessionSchema.parse({ ...base, seller: general }))).toBe(true)
    expect(hasTeamView(sessionSchema.parse({ ...base, seller, permissions: [] }))).toBe(false)
    // Un rol de staff sin view_team (p. ej., uno futuro) no hereda la vista por no ser vendedor.
    const other = { ...base, seller: { ...seller, role: 'supervisor' }, permissions: ['manage_editing'] }
    expect(hasTeamView(sessionSchema.parse(other))).toBe(false)
    // El jefe de despacho: solo stock, sin vista de supervisión.
    const chief = {
      ...base,
      seller: { ...seller, role: 'dispatch_chief' },
      permissions: ['view_stock', 'manage_stock'],
    }
    const parsed = sessionSchema.parse(chief)
    expect(hasTeamView(parsed)).toBe(false)
    expect(can(parsed, 'manage_stock')).toBe(true)
  })
})
