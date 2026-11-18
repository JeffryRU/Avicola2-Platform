import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'

export function useArisStatus(enabled: boolean) {
  const { aris } = useContainer()
  return useQuery({
    queryKey: queryKeys.aris.status,
    queryFn: () => aris.status(),
    enabled,
    staleTime: 10 * 60_000,
    // Mientras se reentrena, se revisa seguido para avisar cuando termine.
    refetchInterval: (q) => (q.state.data?.training_pending ? 30_000 : 30 * 60_000),
  })
}

export function useUploadAris() {
  const { aris } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress: (percent: number) => void }) =>
      aris.upload(file, { onProgress }),
    // La venta real alimenta dashboards, la línea «Modelo» y la sugerencia: todo se vuelve a pedir.
    onSuccess: () => void client.invalidateQueries(),
  })
}
