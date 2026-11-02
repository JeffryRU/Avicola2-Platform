import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ApiError, type KeyValueStore } from '@/core/application/ports'
import { accountState, newAccountSchema, type AdminAccount } from '@/modules/accounts/domain/accounts'
import { AuthService } from '@/modules/auth/application/auth-service'
import type { AuthGateway } from '@/modules/auth/application/ports'
import { newPasswordSchema, type Session } from '@/modules/auth/domain/session'
import { StoredSessionRepository } from '@/modules/auth/infrastructure/stored-session-repository'

const SESSION: Session = {
  seller: { username: 'jperez', name: 'Juan Pérez', zone: 'Zona Norte', role: 'seller' },
  must_change_password: false,
}

class MemoryStore implements KeyValueStore {
  data = new Map<string, unknown>()
  get<T>(key: string, schema: z.ZodType<T>) {
    const parsed = schema.safeParse(this.data.get(key))
    return parsed.success ? parsed.data : null
  }
  set(key: string, value: unknown) {
    this.data.set(key, JSON.parse(JSON.stringify(value)))
  }
  remove(key: string) {
    this.data.delete(key)
  }
}

class FakeGateway implements AuthGateway {
  meResult: Session | ApiError = SESSION
  loggedOut = false
  async login() {
    return SESSION
  }
  async logout() {
    this.loggedOut = true
  }
  async me() {
    if (this.meResult instanceof ApiError) throw this.meResult
    return this.meResult
  }
  async changePassword() {
    return SESSION
  }
}

function setup() {
  const local = new MemoryStore()
  const tab = new MemoryStore()
  const gateway = new FakeGateway()
  let cleaned = 0
  const auth = new AuthService(gateway, new StoredSessionRepository(local, tab), () => void cleaned++)
  return { auth, gateway, local, tab, cleaned: () => cleaned }
}

describe('sesión', () => {
  it('guarda solo el perfil: nunca el token ni la contraseña', async () => {
    const { auth, local } = setup()
    await auth.login({ username: 'jperez', password: 'secreto-123', remember: true })
    const stored = JSON.stringify([...local.data.values()])
    expect(stored).toContain('Juan Pérez')
    expect(stored).not.toContain('secreto-123')
    expect(stored).not.toMatch(/token/i)
  })

  it('"Recordarme" decide si el perfil sobrevive al cerrar la pestaña', async () => {
    const { auth, local, tab } = setup()
    await auth.login({ username: 'jperez', password: 'x', remember: false })
    expect(local.data.size).toBe(0)
    expect(tab.data.size).toBe(1)
  })

  it('al abrir la app, una cookie vencida (401) cierra la sesión local', async () => {
    const { auth, gateway } = setup()
    await auth.login({ username: 'jperez', password: 'x', remember: true })
    gateway.meResult = new ApiError('Sesión inválida o vencida.', 401)
    await auth.verify()
    expect(auth.current()).toBeNull()
  })

  it('sin conexión conserva el perfil (la PWA sigue funcionando offline)', async () => {
    const { auth, gateway } = setup()
    await auth.login({ username: 'jperez', password: 'x', remember: true })
    gateway.meResult = new ApiError('No se pudo conectar con el servidor.', 0)
    await auth.verify()
    expect(auth.current()?.seller.username).toBe('jperez')
  })

  it('cerrar sesión avisa al servidor y limpia los datos locales', async () => {
    const { auth, gateway, local, cleaned } = setup()
    await auth.login({ username: 'jperez', password: 'x', remember: true })
    await auth.logout()
    expect(gateway.loggedOut).toBe(true)
    expect(cleaned()).toBe(1)
    expect(local.data.size).toBe(0)
    expect(auth.current()).toBeNull()
  })
})

describe('validaciones de cuentas', () => {
  it('la nueva contraseña sigue la política del backend', () => {
    const schema = newPasswordSchema('jperez')
    const ok = { current: 'demo1234', next: 'Pollo-fresco-26', confirm: 'Pollo-fresco-26' }
    expect(schema.safeParse(ok).success).toBe(true)
    expect(schema.safeParse({ ...ok, confirm: 'otra' }).success).toBe(false)
    expect(schema.safeParse({ ...ok, next: 'corta1', confirm: 'corta1' }).success).toBe(false)
    expect(schema.safeParse({ ...ok, next: 'jperez2026', confirm: 'jperez2026' }).success).toBe(false)
    expect(schema.safeParse({ ...ok, next: 'demo1234', confirm: 'demo1234' }).success).toBe(false)
  })

  it('el usuario nuevo se normaliza a minúsculas y se valida', () => {
    const parsed = newAccountSchema.parse({ username: ' LTorres ', name: 'Luis', zone: '', role: 'seller' })
    expect(parsed).toEqual({ username: 'ltorres', name: 'Luis', zone: null, role: 'seller' })
    expect(newAccountSchema.safeParse({ ...parsed, username: 'a b' }).success).toBe(false)
  })

  it('estado de la cuenta para el supervisor', () => {
    const now = new Date('2026-11-03T12:00:00Z')
    const base: AdminAccount = {
      username: 'jperez',
      name: 'Juan',
      zone: null,
      role: 'seller',
      is_active: true,
      must_change_password: false,
      locked_until: null,
    }
    expect(accountState(base, now)).toBe('active')
    expect(accountState({ ...base, locked_until: '2026-11-03T12:10:00Z' }, now)).toBe('locked')
    expect(accountState({ ...base, locked_until: '2026-11-03T11:00:00Z' }, now)).toBe('active')
    expect(accountState({ ...base, must_change_password: true }, now)).toBe('must_change')
    expect(accountState({ ...base, is_active: false }, now)).toBe('inactive')
  })
})
