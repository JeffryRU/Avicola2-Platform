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
    mutationFn: ({ message, conversation }: { message: string; conversation: string }) =>
      assistant.ask(message, conversation),
  })
}
