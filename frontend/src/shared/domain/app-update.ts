/**
 * Versión nueva y reinicios del servidor (lógica pura: sin React ni red).
 *
 * El build escribe `/version.json` con su identificador. La app lo consulta cada tanto:
 * - otro identificador → hay una versión nueva: se avisa y se recarga sola;
 * - sin respuesta (o 502/503/504) dos veces seguidas → el servidor se está reiniciando (un
 *   despliegue): se avisa y se sigue consultando seguido hasta que vuelva.
 */

/** Cada cuánto se consulta la versión (ms): normal y mientras el servidor se reinicia. */
export const CHECK_EVERY_MS = 60_000
export const RETRY_EVERY_MS = 3_000
/** Fallos seguidos antes de avisar que se está reiniciando (uno solo puede ser la red). */
export const FAILURES_TO_WARN = 2
/** Segundos que se ve el aviso antes de recargar. */
export const RELOAD_AFTER_S = 4

export type UpdatePhase = 'idle' | 'restarting' | 'updating'

export interface UpdateState {
  phase: UpdatePhase
  failures: number
}

export const INITIAL_UPDATE: UpdateState = { phase: 'idle', failures: 0 }

/** Lo que devolvió una consulta de `/version.json`. */
export type VersionCheck =
  | { kind: 'ok'; build: string }
  /** El servidor no respondió o respondió que no está disponible (se está reiniciando). */
  | { kind: 'down' }
  /** Cualquier otra cosa (404 en desarrollo, JSON raro): no dice nada, se ignora. */
  | { kind: 'unknown' }

/** Cómo leer la respuesta: solo 502/503/504 o la falta de red cuentan como «caído». */
export function readCheck(status: number | null, body: unknown): VersionCheck {
  if (status === null || status === 502 || status === 503 || status === 504) return { kind: 'down' }
  if (status === 200 && typeof body === 'object' && body !== null) {
    const build = (body as Record<string, unknown>).build
    if (typeof build === 'string' && build) return { kind: 'ok', build }
  }
  return { kind: 'unknown' }
}

/** Siguiente estado tras una consulta. `current` es el build que está corriendo en la página. */
export function nextUpdate(state: UpdateState, check: VersionCheck, current: string): UpdateState {
  if (state.phase === 'updating') return state
  if (check.kind === 'down') {
    const failures = state.failures + 1
    return { phase: failures >= FAILURES_TO_WARN ? 'restarting' : state.phase, failures }
  }
  if (check.kind === 'ok' && check.build !== current) return { phase: 'updating', failures: 0 }
  // Volvió con la misma versión (o no se sabe): todo sigue igual.
  return INITIAL_UPDATE
}

/** Cada cuánto consultar en este estado. */
export const delayFor = (state: UpdateState) => (state.failures > 0 ? RETRY_EVERY_MS : CHECK_EVERY_MS)
