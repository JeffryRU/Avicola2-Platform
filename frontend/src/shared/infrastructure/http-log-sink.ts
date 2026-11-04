import type { LogSink } from '@/shared/application/ports'
import type { ClientLogEntry } from '@/shared/domain/client-log'

/** Envía los reportes a POST {baseUrl}/client-logs (responde 204, sin cuerpo). */
export class HttpLogSink implements LogSink {
  private readonly url: string
  constructor(baseUrl: string) {
    this.url = `${baseUrl}/client-logs`
  }

  async send(entries: ClientLogEntry[]) {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
      keepalive: true,
    })
    // 4xx: el lote es inválido o excede el límite; reintentarlo no sirve, se descarta.
    if (response.status >= 500) throw new Error(`client-logs ${response.status}`)
  }

  sendOnExit(entries: ClientLogEntry[]) {
    const body = new Blob([JSON.stringify({ entries })], { type: 'application/json' })
    return typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(this.url, body)
  }
}
