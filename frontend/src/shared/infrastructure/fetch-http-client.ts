import type { z } from 'zod'
import { ApiError, type HttpClient } from '@/shared/application/ports'

interface Options {
  baseUrl: string
  timeoutMs: number
  /** El servidor rechazó la sesión (401): la cookie venció o fue invalidada. */
  onUnauthorized: () => void
}

/**
 * Cliente HTTP con fetch: timeout, errores en español y respuestas validadas.
 * La sesión va en una cookie HttpOnly que el navegador adjunta solo (mismo origen): este código
 * nunca ve el token.
 */
export class FetchHttpClient implements HttpClient {
  private readonly options: Options
  constructor(options: Options) {
    this.options = options
  }

  get<T>(path: string, schema: z.ZodType<T>, query?: Record<string, string | number | undefined>) {
    const params = new URLSearchParams()
    Object.entries(query ?? {}).forEach(([k, v]) => v !== undefined && params.set(k, String(v)))
    const qs = params.size ? `?${params}` : ''
    return this.request(`${path}${qs}`, { method: 'GET' }, schema)
  }

  post<T>(path: string, body: unknown, schema: z.ZodType<T>) {
    return this.request(path, { method: 'POST', body: JSON.stringify(body) }, schema)
  }

  patch<T>(path: string, body: unknown, schema: z.ZodType<T>) {
    return this.request(path, { method: 'PATCH', body: JSON.stringify(body) }, schema)
  }

  private async request<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    const { baseUrl, timeoutMs, onUnauthorized } = this.options
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (init.body) headers['Content-Type'] = 'application/json'

    let response: Response
    try {
      response = await fetch(baseUrl + path, {
        ...init,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      const timeout = e instanceof DOMException && e.name === 'TimeoutError'
      throw new ApiError(timeout ? 'El servidor no respondió a tiempo.' : 'No se pudo conectar con el servidor.', 0)
    }
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      if (response.status === 401) onUnauthorized()
      throw new ApiError(errorMessage(data) ?? `El servidor respondió ${response.status}.`, response.status)
    }
    const parsed = schema.safeParse(data)
    if (!parsed.success) throw new ApiError('La respuesta del servidor no tiene el formato esperado.', response.status)
    return parsed.data
  }
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
