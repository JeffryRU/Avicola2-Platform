import type { KeyValueStore } from '@/shared/application/ports'
import type { SessionRepository } from '@/features/auth/application/ports'
import { sessionSchema, type Session } from '@/features/auth/domain/session'

const KEY = 'nv_session'

/**
 * Solo el perfil (nombre, zona, rol), nunca el token ni la contraseña. "Recordarme" lo guarda
 * en el dispositivo; si no, solo mientras la pestaña siga abierta.
 */
export class StoredSessionRepository implements SessionRepository {
  private readonly persistent: KeyValueStore
  private readonly tab: KeyValueStore
  constructor(persistent: KeyValueStore, tab: KeyValueStore) {
    this.persistent = persistent
    this.tab = tab
  }

  load() {
    const remembered = this.persistent.get(KEY, sessionSchema)
    if (remembered) return { session: remembered, remember: true }
    const session = this.tab.get(KEY, sessionSchema)
    return session ? { session, remember: false } : null
  }

  save(session: Session, remember: boolean) {
    this.clear()
    ;(remember ? this.persistent : this.tab).set(KEY, session)
  }

  clear() {
    this.persistent.remove(KEY)
    this.tab.remove(KEY)
  }
}
