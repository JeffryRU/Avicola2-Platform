import { z } from 'zod'

/** Asistente de la app (ADR 0022): cada persona pregunta con su sesión y ve solo lo suyo. */

/** Igual que el backend (domain/assistant.py). */
export const MAX_MESSAGE = 500
/** El agente consulta varias herramientas: puede tardar bastante más que una consulta normal. */
export const ASSISTANT_TIMEOUT_MS = 120_000

export const assistantInfoSchema = z.object({
  enabled: z.boolean(),
  suggestions: z.array(z.string()),
})
export type AssistantInfo = z.infer<typeof assistantInfoSchema>

export const assistantReplySchema = z.object({
  reply: z.string(),
  suggestions: z.array(z.string()),
})
export type AssistantReply = z.infer<typeof assistantReplySchema>

export interface ChatMessage {
  id: number
  from: 'user' | 'assistant' | 'error'
  text: string
}

/** Lo que se puede enviar: sin espacios de más; vacío o demasiado largo no se envía. */
export function sendable(text: string): string | null {
  const clean = text.trim()
  return clean && clean.length <= MAX_MESSAGE ? clean : null
}

/** Las preguntas para tocar: las que propuso la última respuesta, o las de inicio si aún no hay. */
export function currentSuggestions(messages: ChatMessage[], starters: string[], latest: string[]): string[] {
  const last = messages.at(-1)
  if (!last) return starters
  return last.from === 'assistant' ? latest : starters.slice(0, 3)
}
