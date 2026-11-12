import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import type { ErrorReporter } from '@/shared/application/error-reporter'
import { ApiError } from '@/shared/application/ports'

/** Un reintento como máximo: al entrar un supervisor salen ~8 consultas a la vez. */
const MAX_RETRIES = 1

/** Solo se reintenta una falla pasajera (sin red, timeout, 429, 502-504); nunca un 4xx ni un 500. */
export function shouldRetry(failureCount: number, error: unknown) {
  return failureCount < MAX_RETRIES && error instanceof ApiError && error.isTransient
}

/** Espera creciente con azar: las consultas que fallaron juntas no reintentan todas a la vez. */
export function retryDelay(attempt: number, random = Math.random) {
  return Math.min(30_000, 2_000 * 2 ** attempt) + Math.round(random() * 1_000)
}

/**
 * Errores que conviene ver en logs/frontend.log: el servidor falló (5xx) o respondió algo que no
 * coincide con el esquema. Llevan el request_id para ubicar la línea del log del backend.
 * Sin red o 4xx (sesión vencida, datos inválidos) son esperables y ya se muestran en pantalla.
 */
function reportServerError(errors: ErrorReporter, error: unknown) {
  if (!(error instanceof ApiError)) return
  if (error.status >= 500) errors.report(error, 'api')
  else if (error.status >= 200 && error.status < 300) errors.report(error, 'api', 'warning')
}

/**
 * Valores por defecto de TanStack Query para toda la app:
 * - `staleTime` 30 s: al cambiar de pantalla no se vuelve a pedir lo recién leído.
 * - Sin refetch al volver a la pestaña (el canal SSE invalida lo que cambia); sí al volver la red.
 * - Reintento único y solo ante fallas pasajeras, con espera y azar (ver `shouldRetry`).
 * - Las mutaciones no se reintentan (no son idempotentes).
 */
export function createQueryClient(errors: ErrorReporter) {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error) => reportServerError(errors, error) }),
    mutationCache: new MutationCache({ onError: (error) => reportServerError(errors, error) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: shouldRetry,
        retryDelay: (attempt) => retryDelay(attempt),
      },
      mutations: { retry: false },
    },
  })
}
