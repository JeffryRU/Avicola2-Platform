import { useRequiredSession } from '@/features/auth'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys, REFERENCE_DATA_STALE_MS } from '@/shared/application/query-keys'

/** ¿Hay asistente? Y con qué preguntas empezar (dependen del rol: por usuario). */
export function useAssistantInfo(username: string) {
  const { assistant } = useContainer()
  return useQuery({
    queryKey: queryKeys.assistant.info(username),
    queryFn: () => assistant.info(),
    staleTime: REFERENCE_DATA_STALE_MS,
    retry: false,
  })
}

export function useAskAssistant() {
  const { assistant } = useContainer()
  return useMutation({
    // La respuesta llega en partes: `onDelta` va mostrando el texto mientras se escribe.
    mutationFn: ({
      message,
      conversation,
      onDelta,
    }: {
      message: string
      conversation: string
      onDelta: (text: string) => void
    }) => assistant.askStream(message, conversation, onDelta),
  })
}

/** Si el backend tiene asistente (si no, no se ofrece el botón). */
export function useAssistantEnabled() {
  const { seller } = useRequiredSession()
  return useAssistantInfo(seller.username).data?.enabled === true
}
