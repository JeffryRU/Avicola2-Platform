import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'

export function useStatus() {
  const { status } = useContainer()
  return useQuery({ queryKey: queryKeys.status.all, queryFn: () => status.status(), retry: false })
}

/** Vuelve a pedir al servidor todos los datos en pantalla (todas las consultas). */
export function useReloadAll() {
  const client = useQueryClient()
  return () => client.invalidateQueries()
}
