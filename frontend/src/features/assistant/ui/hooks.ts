import { useRequiredSession } from '@/features/auth'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import {
  rememberedConversationKey,
  rememberedConversationSchema,
  tableFileName,
} from '@/features/assistant/domain/assistant'
import { saveBlob } from '@/features/assistant/ui/download'
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

/** Historial de la persona (solo cuando se mira). */
export function useConversations(username: string, enabled: boolean) {
  const { assistant } = useContainer()
  return useQuery({
    queryKey: queryKeys.assistant.conversations(username),
    queryFn: () => assistant.conversations(),
    enabled,
    retry: false,
  })
}

/** Refresca el historial (tras preguntar o borrar). */
export function useRefreshConversations(username: string) {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: queryKeys.assistant.conversations(username) })
}

export function useOpenConversation() {
  const { assistant } = useContainer()
  return useMutation({ mutationFn: (id: string) => assistant.conversation(id) })
}

export function useDeleteConversation(username: string) {
  const { assistant } = useContainer()
  const refresh = useRefreshConversations(username)
  return useMutation({
    mutationFn: (id: string) => assistant.deleteConversation(id),
    onSuccess: () => refresh(),
  })
}

/** Descarga el Excel de una tabla con el nombre de su título. */
export function useDownloadTable() {
  const { assistant } = useContainer()
  return useMutation({
    mutationFn: async ({
      messageId,
      index,
      title,
    }: {
      messageId: string
      index: number
      title: string | null | undefined
    }) => saveBlob(await assistant.downloadTable(messageId, index), tableFileName(title)),
  })
}

export function useLinkCode() {
  const { assistant } = useContainer()
  return useMutation({ mutationFn: () => assistant.linkCode() })
}

/** La conversación abierta, recordada por persona para retomarla al recargar. */
export function useRememberedConversation(username: string) {
  const { preferences } = useContainer()
  const key = rememberedConversationKey(username)
  return {
    read: () => preferences.get(key, rememberedConversationSchema)?.id ?? null,
    write: (id: string) => preferences.set(key, { id }),
    clear: () => preferences.remove(key),
  }
}
