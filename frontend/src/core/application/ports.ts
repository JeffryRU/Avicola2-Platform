import type { z } from 'zod'
import type { ClientLogEntry } from '@/core/domain/client-log'

/** Almacenamiento clave-valor del dispositivo (localStorage en el navegador). */
export interface KeyValueStore {
  get<T>(key: string, schema: z.ZodType<T>): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

/** Cliente HTTP que valida cada respuesta con un esquema de zod. */
export interface HttpClient {
  get<T>(path: string, schema: z.ZodType<T>, query?: Record<string, string | number | undefined>): Promise<T>
  post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T>
}

/** Error de la API con el código HTTP (0 = sin conexión o sin respuesta). */
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }

  /** 4xx: la petición es inválida y reintentarla no sirve. */
  get isRejected() {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429
  }
}

/** Destino de los reportes de errores del navegador (el backend los guarda en logs/frontend.log). */
export interface LogSink {
  send(entries: ClientLogEntry[]): Promise<void>
  /** Envío de último momento al cerrar la página (sin esperar respuesta). */
  sendOnExit(entries: ClientLogEntry[]): boolean
}
