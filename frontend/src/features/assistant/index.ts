/** Punto de entrada público de la feature: otras features y app/ importan solo desde aquí (ADR 0008). */
export type { AssistantGateway } from '@/features/assistant/application/ports'
export { AssistantPopup } from '@/features/assistant/ui/components/assistant-button'
export { useAssistantEnabled } from '@/features/assistant/ui/hooks'
export { ASSISTANT_CLOSE, ASSISTANT_LABEL, ASSISTANT_OPEN } from '@/features/assistant/types/assistant'
