import type { LogSink } from '@/shared/application/ports'
import type { ClientLogEntry } from '@/shared/domain/client-log'
import { apiUrl, endpoints } from '@/shared/infrastructure/api/endpoints'

/**
 * Envía los reportes a POST {baseUrl}/client-logs (responde 204, sin cuerpo). Va con fetch y
 * sendBeacon, no con el cliente HTTP: debe funcionar aunque la app esté rota o cerrándose.
 * Cada reporte de un error de la API lleva su `request_id` (y lo repite al final del mensaje).
 */
export class HttpLogSink implements LogSink {
  private readonly url: string
  constructor(baseUrl: string) {
    this.url = apiUrl(baseUrl, endpoints.logs.client)
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
