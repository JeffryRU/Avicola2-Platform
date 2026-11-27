import { z } from 'zod'
import {
  AGO_NOW,
  AGO_YESTERDAY,
  agoDays,
  agoHours,
  agoMinutes,
  TABLE_DEFAULT_FILE,
  TABLE_RECOMMEND,
  TABLE_WHY,
} from '@/features/assistant/types/assistant'

/** Asistente de la app (ADR 0022 y 0024): cada persona pregunta con su sesión y ve solo lo suyo. */

/** Igual que el backend (domain/assistant.py). */
export const MAX_MESSAGE = 500
/** El agente consulta varias herramientas: puede tardar bastante más que una consulta normal. */
export const ASSISTANT_TIMEOUT_MS = 120_000

export const assistantInfoSchema = z.object({
  enabled: z.boolean(),
  suggestions: z.array(z.string()),
})
export type AssistantInfo = z.infer<typeof assistantInfoSchema>

/** Una celda llega como texto (lo que escribió el agente); un número se acepta y se pasa a texto. */
const cellSchema = z.union([z.string(), z.number()]).transform(String)

/** Parte de una respuesta (ADR 0024): texto o tabla. */
export const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('table'),
    title: z.string().nullish(),
    columns: z.array(z.string()),
    rows: z.array(z.array(cellSchema)),
  }),
])
export type Block = z.infer<typeof blockSchema>
export type TableBlock = Extract<Block, { type: 'table' }>

export const assistantReplySchema = z.object({
  reply: z.string(),
  suggestions: z.array(z.string()),
  message_id: z.string().nullish(),
  blocks: z.array(blockSchema).default([]),
})
export type AssistantReply = z.infer<typeof assistantReplySchema>

export interface ChatMessage {
  id: number
  from: 'user' | 'assistant' | 'error'
  text: string
  /** Id del mensaje guardado en el servidor (para descargar sus tablas en Excel). */
  messageId?: string
  /** Respuesta final por partes; mientras llega el streaming no hay y se muestra `text`. */
  blocks?: Block[]
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

/** Una línea de la respuesta en partes (POST /assistant/messages/stream, NDJSON). */
export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({
    type: z.literal('done'),
    reply: z.string(),
    suggestions: z.array(z.string()),
    message_id: z.string().nullish(),
    blocks: z.array(blockSchema).default([]),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
])
export type StreamEvent = z.infer<typeof streamEventSchema>

// --- Historial -------------------------------------------------------------------------------

export const channelSchema = z.enum(['app', 'telegram', 'whatsapp'])
export type Channel = z.infer<typeof channelSchema>

export const conversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  channel: channelSchema,
  updated_at: z.string(),
  preview: z.string().nullish(),
})
export type ConversationSummary = z.infer<typeof conversationSummarySchema>
export const conversationListSchema = z.array(conversationSummarySchema)

export const storedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  blocks: z.array(blockSchema).nullish(),
  suggestions: z.array(z.string()).nullish(),
  created_at: z.string().nullish(),
})

export const conversationDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  channel: channelSchema,
  messages: z.array(storedMessageSchema),
})
export type ConversationDetail = z.infer<typeof conversationDetailSchema>

/** Lo que se recuerda de la conversación abierta, para retomarla al recargar. */
export const rememberedConversationSchema = z.object({ id: z.string().min(1) })
export const rememberedConversationKey = (username: string) => `assistant.conversation.${username}`

/** Los mensajes guardados como los muestra el panel (los ids locales siguen desde `firstId`). */
export function toChatMessages(detail: ConversationDetail, firstId: number): ChatMessage[] {
  return detail.messages.map((m, i) => ({
    id: firstId + i,
    from: m.role,
    text: m.text,
    ...(m.role === 'assistant' ? { messageId: m.id, blocks: m.blocks ?? undefined } : {}),
  }))
}

/** Las preguntas con que sigue la última respuesta guardada. */
export function lastSuggestions(detail: ConversationDetail): string[] {
  const last = detail.messages.at(-1)
  return last?.role === 'assistant' ? (last.suggestions ?? []) : []
}

/** «hace 5 min», «ayer», «hace 3 días»; pasada una semana, la fecha. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return AGO_NOW
  if (minutes < 60) return agoMinutes(minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return agoHours(hours)
  const days = Math.floor(hours / 24)
  if (days === 1) return AGO_YESTERDAY
  if (days < 7) return agoDays(days)
  return then.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// --- Tablas ----------------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const ILLEGAL_FILE_CHARS = /[\\/:*?"<>|\u0000-\u001f]+/g

/** Nombre del Excel: el título de la tabla (sin caracteres que un archivo no admite) + «.xlsx». */
export function tableFileName(title: string | null | undefined): string {
  const base = (title ?? '')
    .replace(ILLEGAL_FILE_CHARS, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[-. ]+|[-. ]+$/g, '')
    .slice(0, 80)
    .trim()
  return `${base || TABLE_DEFAULT_FILE}.xlsx`
}

/** Las dos preguntas rápidas de una tabla; con título, lo incluyen. */
export function tableQuestions(title: string | null | undefined): string[] {
  const t = title?.trim()
  const ask = (stem: string) => (t ? `${stem} en "${t}"?` : `${stem}?`)
  return [ask(TABLE_WHY), ask(TABLE_RECOMMEND)]
}

const NUMBER = /^[-+]?\s*[\d.,]+\s*(%|kg|u)?$/i

/** Columnas de números (todas las celdas con contenido lo son): van alineadas a la derecha. */
export function numericColumns(table: Pick<TableBlock, 'columns' | 'rows'>): boolean[] {
  return table.columns.map((_, i) => {
    const cells = table.rows.map((r) => (r[i] ?? '').trim()).filter(Boolean)
    return cells.length > 0 && cells.every((c) => NUMBER.test(c))
  })
}

/** Los bloques de un mensaje; sin ellos (streaming, error) es su texto como un solo bloque. */
export function messageBlocks(m: Pick<ChatMessage, 'text' | 'blocks'>): Block[] {
  return m.blocks?.length ? m.blocks : [{ type: 'text', text: m.text }]
}

// --- Vincular Telegram o WhatsApp ---------------------------------------------------------------

export const linkCodeSchema = z.object({ code: z.string(), expires_at: z.string() })
export type LinkCode = z.infer<typeof linkCodeSchema>

/** Segundos que le quedan al código (0 si venció o la fecha no se entiende). */
export function secondsLeft(expiresAt: string, now: number = Date.now()): number {
  const end = new Date(expiresAt).getTime()
  return Number.isNaN(end) ? 0 : Math.max(0, Math.ceil((end - now) / 1000))
}

/** «9:05» */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
