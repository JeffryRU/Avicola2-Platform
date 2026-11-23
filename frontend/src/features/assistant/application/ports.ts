import type { AssistantInfo, AssistantReply } from '@/features/assistant/domain/assistant'

/** El asistente de la app: si está disponible, con qué preguntas empezar y cada pregunta. */
export interface AssistantGateway {
  info(): Promise<AssistantInfo>
  ask(message: string, conversation: string): Promise<AssistantReply>
  /**
   * La misma pregunta, con la respuesta en partes: `onDelta` recibe el texto a medida que llega y
   * la promesa, la respuesta final (que reemplaza lo mostrado). Sin streaming en el servidor,
   * equivale a `ask`.
   */
  askStream(message: string, conversation: string, onDelta: (text: string) => void): Promise<AssistantReply>
}
