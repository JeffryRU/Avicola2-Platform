import axios, { type AxiosInstance, type AxiosRequestConfig, isAxiosError, isCancel } from 'axios'
import type { z } from 'zod'
import { ApiError, type HttpClient, type UploadOptions } from '@/shared/application/ports'

interface Options {
  baseUrl: string
  timeoutMs: number
  /** El servidor rechazó la sesión (401): la cookie venció o fue invalidada. */
  onUnauthorized: () => void
  /** El servidor negó el permiso (403): puede que la sesión del navegador ya sea otra cuenta. */
  onForbidden?: () => void
  /** Solo para pruebas: reemplaza la red por una función. */
  adapter?: AxiosRequestConfig['adapter']
}

type Query = Record<string, string | number | undefined>

const UPLOAD_TIMEOUT_MS = 5 * 60_000

/**
 * Cliente HTTP con axios: timeout, errores en español, respuestas validadas con zod y subida de
 * archivos con progreso (`upload`). En el navegador axios usa XMLHttpRequest, la única API que
 * informa el progreso de subida en todos los navegadores, Safari de iPhone incluido.
 *
 * La sesión va en una cookie HttpOnly que el navegador adjunta solo (mismo origen): este código
 * nunca ve el token.
 */
export class AxiosHttpClient implements HttpClient {
  private readonly api: AxiosInstance

  constructor(options: Options) {
    this.api = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      withCredentials: false, // mismo origen: la cookie viaja igual
      // El backend responde Cache-Control: no-store en /api: no hace falta pedirlo aquí.
      headers: { Accept: 'application/json' },
      // Las respuestas se validan con zod: axios no debe lanzar por el código ni transformar nada raro.
      validateStatus: () => true,
      adapter: options.adapter,
    })
    this.api.interceptors.response.use((response) => {
      if (response.status === 401) options.onUnauthorized()
      if (response.status === 403) options.onForbidden?.()
      return response
    })
  }

  get<T>(path: string, schema: z.ZodType<T>, query?: Query) {
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
    let response
    try {
      response = await this.api.request<unknown>(config)
    } catch (e) {
      throw networkError(e)
    }
    const data = response.data === '' ? null : response.data
    if (response.status < 200 || response.status >= 300) {
      throw new ApiError(errorMessage(data) ?? `El servidor respondió ${response.status}.`, response.status)
    }
    const parsed = schema.safeParse(data)
    if (!parsed.success) throw new ApiError('La respuesta del servidor no tiene el formato esperado.', response.status)
    return parsed.data
  }
}

/** Porcentaje enviado; sin tamaño conocido (0) no hay porcentaje que calcular. */
function percent(loaded: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.round((loaded / total) * 100))
}

function definedOnly(query?: Query) {
  if (!query) return undefined
  return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined))
}

function networkError(e: unknown): ApiError {
  if (isCancel(e)) return new ApiError('Se canceló el envío.', 0)
  if (isAxiosError(e) && (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT')) {
    return new ApiError('El servidor no respondió a tiempo.', 0)
  }
  return new ApiError('No se pudo conectar con el servidor.', 0)
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
