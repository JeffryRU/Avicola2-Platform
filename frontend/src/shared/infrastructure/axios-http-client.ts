import axios, { type AxiosInstance, type AxiosRequestConfig, isAxiosError, isCancel } from 'axios'
import type { z } from 'zod'
import {
  ApiError,
  REQUEST_ID_HEADER,
  type HttpClient,
  type QueryParams,
  type UploadOptions,
} from '@/shared/application/ports'

interface Options {
  baseUrl: string
  timeoutMs: number
  /** El servidor rechazó la sesión (401): la cookie venció o fue invalidada. */
  onUnauthorized: () => void
  /** Solo para pruebas: reemplaza la red por una función. */
  adapter?: AxiosRequestConfig['adapter']
  /** Id de cada petición (por defecto, 12 caracteres hex como los que genera el backend). */
  newRequestId?: () => string
}

const UPLOAD_TIMEOUT_MS = 5 * 60_000

/**
 * Cliente HTTP con axios: timeout, errores en español, respuestas validadas con zod y subida de
 * archivos con progreso (`upload`). En el navegador axios usa XMLHttpRequest, la única API que
 * informa el progreso de subida en todos los navegadores, Safari de iPhone incluido.
 *
 * La sesión va en una cookie HttpOnly que el navegador adjunta solo (mismo origen): este código
 * nunca ve el token.
 *
 * Trazabilidad: cada petición lleva un `X-Request-ID` nuevo. El backend lo usa en su log
 * (`[id]` en cada línea) y lo devuelve; un `ApiError` lo trae en `requestId` y el reporte de
 * errores del navegador lo incluye, así un error de la app se ubica en el log del servidor.
 */
export class AxiosHttpClient implements HttpClient {
  private readonly api: AxiosInstance
  private readonly newRequestId: () => string

  constructor(options: Options) {
    this.newRequestId = options.newRequestId ?? defaultRequestId
    this.api = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      withCredentials: false, // mismo origen: la cookie viaja igual
      // El backend responde Cache-Control: no-store en /api: no hace falta pedirlo aquí.
      headers: { Accept: 'application/json' },
      // Las respuestas se validan con zod: axios no debe lanzar por el código ni transformar nada raro.
      validateStatus: () => true,
      // Listas como parámetro repetido (?weight=1&weight=2), que es lo que lee FastAPI.
      paramsSerializer: { indexes: null },
      adapter: options.adapter,
    })
    this.api.interceptors.response.use((response) => {
      if (response.status === 401) options.onUnauthorized()
      return response
    })
  }

  get<T>(path: string, schema: z.ZodType<T>, query?: QueryParams) {
    return this.request({ url: path, method: 'GET', params: definedOnly(query) }, schema)
  }

  post<T>(path: string, body: unknown, schema: z.ZodType<T>) {
    return this.request({ url: path, method: 'POST', data: body }, schema)
  }

  patch<T>(path: string, body: unknown, schema: z.ZodType<T>) {
    return this.request({ url: path, method: 'PATCH', data: body }, schema)
  }

  put<T>(path: string, body: unknown, schema: z.ZodType<T>) {
    return this.request({ url: path, method: 'PUT', data: body }, schema)
  }

  upload<T>(path: string, file: Blob, schema: z.ZodType<T>, options: UploadOptions = {}) {
    const form = new FormData()
    Object.entries(options.fields ?? {}).forEach(([k, v]) => form.append(k, v))
    const name = file instanceof File ? file.name : 'archivo'
    form.append(options.fieldName ?? 'file', file, name)
    const { onProgress } = options
    return this.request(
      {
        url: path,
        method: 'POST',
        data: form,
        signal: options.signal,
        timeout: options.timeoutMs ?? UPLOAD_TIMEOUT_MS,
        onUploadProgress: onProgress ? (e) => onProgress(percent(e.loaded, e.total ?? file.size)) : undefined,
      },
      schema,
    )
  }

  private async request<T>(config: AxiosRequestConfig, schema: z.ZodType<T>): Promise<T> {
    const sent = this.newRequestId()
    let response
    try {
      response = await this.api.request<unknown>({ ...config, headers: { [REQUEST_ID_HEADER]: sent } })
    } catch (e) {
      throw networkError(e, sent)
    }
    // El backend devuelve el id que usó (el nuestro, o uno propio si el nuestro no era válido).
    const echoed: unknown = response.headers[REQUEST_ID_HEADER.toLowerCase()]
    const requestId = typeof echoed === 'string' && echoed ? echoed : sent
    const data = response.data === '' ? null : response.data
    if (response.status < 200 || response.status >= 300) {
      const message = errorMessage(data) ?? `El servidor respondió ${response.status}.`
      throw new ApiError(message, response.status, requestId)
    }
    const parsed = schema.safeParse(data)
    if (!parsed.success) {
      throw new ApiError('La respuesta del servidor no tiene el formato esperado.', response.status, requestId)
    }
    return parsed.data
  }
}

/** Porcentaje enviado; sin tamaño conocido (0) no hay porcentaje que calcular. */
function percent(loaded: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.round((loaded / total) * 100))
}

/** 12 caracteres hex, como los ids que genera el backend (acepta [A-Za-z0-9._-]{1,64}). */
function defaultRequestId() {
  // getRandomValues funciona también fuera de HTTPS (randomUUID no).
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')
}

function definedOnly(query?: QueryParams) {
  if (!query) return undefined
  return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined))
}

function networkError(e: unknown, requestId: string): ApiError {
  if (isCancel(e)) return new ApiError('Se canceló el envío.', 0, requestId)
  if (isAxiosError(e) && (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT')) {
    return new ApiError('El servidor no respondió a tiempo.', 0, requestId)
  }
  return new ApiError('No se pudo conectar con el servidor.', 0, requestId)
}

/** FastAPI responde {"detail": "texto"} o {"detail": [{msg}]} en errores de validación. */
function errorMessage(data: unknown): string | null {
  const detail = (data as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  const first: unknown = Array.isArray(detail) ? detail[0] : null
  const msg = (first as { msg?: unknown } | null)?.msg
  if (typeof msg === 'string') return `Datos inválidos: ${msg}`
  return null
}
