import { z } from 'zod'

/**
 * Enlace del asistente (el chat de n8n, ADR 0017), de `VITE_ASSISTANT_URL`. Sin enlace, o con uno
 * que no sea http(s), no hay botón: el asistente es opcional.
 */
export function assistantUrl(raw: string | undefined): string | null {
  const url = z.url({ protocol: /^https?$/ }).safeParse(raw?.trim())
  return url.success ? url.data : null
}
