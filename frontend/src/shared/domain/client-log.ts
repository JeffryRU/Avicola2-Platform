import { z } from 'zod'

/** Reporte de un error del navegador; mismos límites que POST /api/client-logs. */
export const clientLogEntrySchema = z.object({
  level: z.enum(['error', 'warning', 'info']),
  kind: z.string().regex(/^[a-z_-]{1,32}$/),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  route: z.string().max(300),
  user: z
    .string()
    .regex(/^[\w.@-]{1,64}$/)
    .optional(),
  app_version: z.string().max(40).optional(),
  /** Id de la petición que falló (X-Request-ID): ubica el error en el log del backend. */
  request_id: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,64}$/)
    .optional(),
  at: z.iso.datetime(),
})
export type ClientLogEntry = z.infer<typeof clientLogEntrySchema>
export type ClientLogLevel = ClientLogEntry['level']

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** Id de petición de un error de la API (ApiError.requestId), si lo trae. */
export function requestIdOf(error: unknown): string | undefined {
  const id = (error as { requestId?: unknown } | null)?.requestId
  return typeof id === 'string' && id ? id : undefined
}

/**
 * Convierte cualquier cosa lanzada (Error, texto, objeto) en mensaje + traza acotados. Si es un
 * error de la API, el mensaje termina con `[request_id=…]`, el mismo id del log del backend.
 */
export function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    const rid = requestIdOf(error)
    const message = `${error.name}: ${error.message}${rid ? ` [request_id=${rid}]` : ''}`.trim()
    return { message: clip(message || 'Error sin mensaje', 2000), stack: error.stack && clip(error.stack, 8000) }
  }
  let text: string
  try {
    text = typeof error === 'string' ? error : JSON.stringify(error)
  } catch {
    text = String(error)
  }
  return { message: clip(text || 'Error sin mensaje', 2000) }
}
