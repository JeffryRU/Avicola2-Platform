import type { KeyValueStore } from '@/core/application/ports'
import type { SessionRepository } from '@/modules/auth/application/ports'
import { sessionSchema, type Session } from '@/modules/auth/domain/session'

const KEY = 'nv_session'

/** "Recordarme" guarda en el dispositivo; si no, solo mientras la pestaña siga abierta. */
export class StoredSessionRepository implements SessionRepository {
  private readonly persistent: KeyValueStore
  private readonly tab: KeyValueStore
  constructor(persistent: KeyValueStore, tab: KeyValueStore) {
    this.persistent = persistent
    this.tab = tab
  }

  load(): Session | null {
    return this.persistent.get(KEY, sessionSchema) ?? this.tab.get(KEY, sessionSchema)
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
