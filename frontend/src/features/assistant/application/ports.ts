import type { AssistantInfo, AssistantReply } from '@/features/assistant/domain/assistant'

/** El asistente de la app: si está disponible, con qué preguntas empezar y cada pregunta. */
export interface AssistantGateway {
  info(): Promise<AssistantInfo>
  ask(message: string, conversation: string): Promise<AssistantReply>
}
