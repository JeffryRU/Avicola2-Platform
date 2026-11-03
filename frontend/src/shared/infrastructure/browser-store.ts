import type { z } from 'zod'
import type { KeyValueStore } from '@/shared/application/ports'

/**
 * localStorage/sessionStorage con validación al leer: un dato viejo o corrupto se descarta
 * en vez de romper la app. Si el navegador bloquea el almacenamiento, se ignora en silencio.
 */
export class BrowserStore implements KeyValueStore {
  private readonly storage: () => Storage
  constructor(storage: () => Storage = () => localStorage) {
    this.storage = storage
  }

  get<T>(key: string, schema: z.ZodType<T>): T | null {
    try {
      const raw = this.storage().getItem(key)
      if (raw === null) return null
      const parsed = schema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  set(key: string, value: unknown) {
    try {
      this.storage().setItem(key, JSON.stringify(value))
    } catch {
      /* almacenamiento bloqueado o lleno */
    }
  }

  remove(key: string) {
    try {
      this.storage().removeItem(key)
    } catch {
      /* almacenamiento bloqueado */
    }
  }
}
