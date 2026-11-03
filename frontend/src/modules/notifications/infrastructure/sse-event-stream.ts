import type { EventStream, StreamHandlers } from '@/modules/notifications/application/ports'
import { REALTIME_EVENT_TYPES, realtimeEventSchema, type RealtimeEvent } from '@/modules/notifications/domain/events'

/** Reintento si la conexión se cierra del todo (servidor caído o sesión rechazada). */
const RECONNECT_MS = 15_000

/**
 * Canal SSE con EventSource. El navegador reconecta solo ante cortes breves; si el servidor
 * responde con error (p. ej., 401), EventSource se rinde: aquí se avisa (`onLost`) y se
 * reintenta más tarde. La cookie de sesión viaja sola (mismo origen).
 */
export class SseEventStream implements EventStream {
  private readonly url: string
  constructor(url: string) {
    this.url = url
  }

  connect(onEvent: (event: RealtimeEvent) => void, { onLost, onReconnect }: StreamHandlers = {}) {
    let source: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let closed = false
    // Detrás de un proxy (p. ej. Vercel corta a los 2 min) la conexión se renueva seguido:
    // cada reapertura avisa para recuperar lo que llegó mientras tanto.
    let openedBefore = false

    const open = () => {
      source = new EventSource(this.url, { withCredentials: true })
      source.onopen = () => {
        if (openedBefore) onReconnect?.()
        openedBefore = true
      }
      for (const type of REALTIME_EVENT_TYPES) {
        source.addEventListener(type, (message) => {
          let data: unknown
          try {
            data = JSON.parse((message as MessageEvent<string>).data)
          } catch {
            return
          }
          const parsed = realtimeEventSchema.safeParse({ type, data })
          if (parsed.success) onEvent(parsed.data)
        })
      }
      source.onerror = () => {
        if (closed || source?.readyState !== EventSource.CLOSED) return
        onLost?.()
        retry = setTimeout(() => !closed && open(), RECONNECT_MS)
      }
    }

    open()
    return () => {
      closed = true
      clearTimeout(retry)
      source?.close()
    }
  }
}
