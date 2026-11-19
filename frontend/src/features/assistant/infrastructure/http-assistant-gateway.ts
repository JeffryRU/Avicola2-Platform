import type { HttpClient } from '@/shared/application/ports'
import { endpoints } from '@/shared/infrastructure/api/endpoints'
import type { AssistantGateway } from '@/features/assistant/application/ports'
import { ASSISTANT_TIMEOUT_MS, assistantInfoSchema, assistantReplySchema } from '@/features/assistant/domain/assistant'

export class HttpAssistantGateway implements AssistantGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  info = () => this.http.get(endpoints.assistant.info, assistantInfoSchema)

  ask = (message: string, conversation: string) =>
    this.http.post(endpoints.assistant.messages, { message, conversation }, assistantReplySchema, {
      timeoutMs: ASSISTANT_TIMEOUT_MS,
    })
}
