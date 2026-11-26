import type {
  AssistantInfo,
  AssistantReply,
  ConversationDetail,
  ConversationSummary,
  LinkCode,
} from '@/features/assistant/domain/assistant'

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
  /** Historial de la persona, de la más reciente a la más vieja. */
  conversations(limit?: number): Promise<ConversationSummary[]>
  conversation(id: string): Promise<ConversationDetail>
  deleteConversation(id: string): Promise<void>
  /** El Excel de una tabla de un mensaje guardado. */
  downloadTable(messageId: string, index: number): Promise<Blob>
  /** Código de 6 caracteres para vincular Telegram o WhatsApp (vale 10 minutos). */
  linkCode(): Promise<LinkCode>
}
