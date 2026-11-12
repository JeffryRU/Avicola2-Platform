import type { z } from 'zod'
import type { ClientLogEntry } from '@/shared/domain/client-log'
import type { ExportFormat, ExportTable } from '@/shared/domain/export'

/** Almacenamiento clave-valor del dispositivo (localStorage en el navegador). */
export interface KeyValueStore {
  get<T>(key: string, schema: z.ZodType<T>): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

/** Opciones de una subida de archivos. */
export interface UploadOptions {
  /** Progreso de 0 a 100 mientras se envía el archivo (sirve para una barra de progreso). */
  onProgress?: (percent: number) => void
  /** Cancela la subida (p. ej., la persona toca "Cancelar"). */
  signal?: AbortSignal
  /** Campos de texto que acompañan al archivo en el mismo formulario. */
  fields?: Record<string, string>
  /** Nombre del campo del archivo en el formulario (por defecto, "file"). */
  fieldName?: string
  /** Las subidas pesadas tardan más que una consulta: por defecto, 5 minutos. */
  timeoutMs?: number
}

/** Parámetros de una consulta; una lista se envía repitiendo el nombre (?weight=1&weight=2). */
export type QueryParams = Record<string, string | number | readonly (string | number)[] | undefined>

/** Cliente HTTP que valida cada respuesta con un esquema de zod. */
export interface HttpClient {
  get<T>(path: string, schema: z.ZodType<T>, query?: QueryParams): Promise<T>
  post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T>
  patch<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T>
  put<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T>
  /** Sube un archivo (multipart/form-data) e informa el progreso. */
  upload<T>(path: string, file: Blob, schema: z.ZodType<T>, options?: UploadOptions): Promise<T>
}

/** Cabecera con el id de cada petición: el backend lo acepta, lo imprime en su log y lo devuelve. */
export const REQUEST_ID_HEADER = 'X-Request-ID'

/**
 * Error de la API con el código HTTP (0 = sin conexión, sin respuesta o cancelada) y el id de la
 * petición (`requestId`), el mismo que aparece entre corchetes en el log del backend.
 */
export class ApiError extends Error {
  readonly status: number
  readonly requestId: string | undefined
  constructor(message: string, status: number, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.requestId = requestId
  }

  /**
   * Falla pasajera (sin conexión, timeout, servidor saturado o reiniciando: 408, 429, 502-504):
   * reintentar más tarde puede funcionar. Un 500 es un error del servidor y se repetiría igual.
   */
  get isTransient() {
    return [0, 408, 429, 502, 503, 504].includes(this.status)
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

/**
 * Instalación de la PWA en el dispositivo.
 * - `available`: el navegador ofrece instalarla (Android, Chrome, Edge).
 * - `ios`: iPhone/iPad, se instala a mano (Compartir → Agregar a inicio).
 * - `installed`: ya se abre como app.
 * - `unavailable`: el navegador no lo permite.
 */
export type InstallState = 'available' | 'ios' | 'installed' | 'unavailable'

/** Sistema del equipo: decide si se ofrece la app nativa además de la app web. */
export type DevicePlatform = 'android' | 'ios' | 'other'

export interface AppInstaller {
  state(): InstallState
  platform(): DevicePlatform
  /** Instalador de la app nativa para este equipo (APK de la última Release), o null si no hay. */
  nativeAppUrl(): string | null
  subscribe(listener: () => void): () => void
  /** Muestra el diálogo del navegador; true si la persona aceptó. */
  install(): Promise<boolean>
}

/** Exporta una tabla a un archivo (CSV, Excel o PDF) y lo descarga. */
export interface TableExporter {
  export(table: ExportTable, format: ExportFormat, fileBase: string): Promise<void>
}
