import type { HttpClient } from '@/shared/application/ports'
import { ApiError, REQUEST_ID_HEADER } from '@/shared/application/ports'
import { apiUrl, endpoints } from '@/shared/infrastructure/api/endpoints'
import type { AssistantGateway } from '@/features/assistant/application/ports'
import {
  ASSISTANT_TIMEOUT_MS,
  assistantInfoSchema,
  conversationDetailSchema,
  conversationListSchema,
  linkCodeSchema,
  assistantReplySchema,
  streamEventSchema,
  type AssistantReply,
} from '@/features/assistant/domain/assistant'

const STREAM_BROKEN = 'La respuesta se cortó antes de terminar.'

export class HttpAssistantGateway implements AssistantGateway {
  private readonly http: HttpClient
  private readonly baseUrl: string
  constructor(http: HttpClient, baseUrl: string) {
    this.http = http
    this.baseUrl = baseUrl
  }

  info = () => this.http.get(endpoints.assistant.info, assistantInfoSchema)

  ask = (message: string, conversation: string) =>
    this.http.post(endpoints.assistant.messages, { message, conversation }, assistantReplySchema, {
      timeoutMs: ASSISTANT_TIMEOUT_MS,
    })

  conversations = (limit = 30) => this.http.get(endpoints.assistant.conversations, conversationListSchema, { limit })

  conversation = (id: string) => this.http.get(endpoints.assistant.conversation(id), conversationDetailSchema)

  linkCode = () => this.http.post(endpoints.assistant.linkCode, {}, linkCodeSchema)

  deleteConversation = async (id: string): Promise<void> => {
    await this.plainRequest('DELETE', endpoints.assistant.conversation(id))
  }

  downloadTable = async (messageId: string, index: number): Promise<Blob> => {
    const response = await this.plainRequest('GET', endpoints.assistant.tableXlsx(messageId, index))
    return await response.blob()
  }

  /** `fetch` con la cookie de sesión, para lo que no es JSON (archivos, 204). */
  private async plainRequest(method: 'GET' | 'DELETE', path: string): Promise<Response> {
    const requestId = crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 12)
    let response: Response
    try {
      response = await fetch(apiUrl(this.baseUrl, path), {
        method,
        credentials: 'same-origin',
        headers: { [REQUEST_ID_HEADER]: requestId },
      })
    } catch {
      throw new ApiError('No se pudo conectar con el servidor.', 0, requestId)
    }
    if (!response.ok) {
      const detail: unknown = await response.json().catch(() => null)
      const text =
        detail && typeof detail === 'object' && 'detail' in detail && typeof detail.detail === 'string'
          ? detail.detail
          : `El servidor respondió ${String(response.status)}.`
      throw new ApiError(text, response.status, requestId)
    }
    return response
  }

  /**
   * Con `fetch` (axios no lee el cuerpo mientras llega): una línea JSON por evento. La cookie de
   * sesión viaja sola (mismo origen). Un servidor sin este endpoint responde con `ask`.
   */
  askStream = async (
    message: string,
    conversation: string,
    onDelta: (text: string) => void,
  ): Promise<AssistantReply> => {
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), ASSISTANT_TIMEOUT_MS)
    const requestId = crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 12)
    try {
      let response: Response
      try {
        response = await fetch(apiUrl(this.baseUrl, endpoints.assistant.stream), {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson',
            [REQUEST_ID_HEADER]: requestId,
          },
          body: JSON.stringify({ message, conversation }),
          signal: abort.signal,
        })
      } catch {
        throw new ApiError(
          abort.signal.aborted ? 'El servidor no respondió a tiempo.' : 'No se pudo conectar con el servidor.',
          0,
          requestId,
        )
      }
      // Un servidor anterior no tiene este endpoint (404, o 405 por la ruta de la app): de una vez.
      if (response.status === 404 || response.status === 405) return await this.ask(message, conversation)
      if (!response.ok || !response.body) {
        const detail: unknown = await response.json().catch(() => null)
        const text =
          detail && typeof detail === 'object' && 'detail' in detail && typeof detail.detail === 'string'
            ? detail.detail
            : `El servidor respondió ${String(response.status)}.`
        throw new ApiError(text, response.status, requestId)
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const lines = buffer.split('\n')
        buffer = done ? '' : (lines.pop() ?? '')
        for (const line of lines) {
          if (!line.trim()) continue
          const parsed = streamEventSchema.safeParse(JSON.parse(line))
          if (!parsed.success) continue
          const event = parsed.data
          if (event.type === 'delta') onDelta(event.text)
          else if (event.type === 'done')
            return {
              reply: event.reply,
              suggestions: event.suggestions,
              message_id: event.message_id,
              blocks: event.blocks,
            }
          else throw new ApiError(event.message, 503, requestId)
        }
        if (done) throw new ApiError(STREAM_BROKEN, 0, requestId)
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
