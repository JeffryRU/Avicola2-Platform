import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'

export function useModelSummary() {
  const { model } = useContainer()
  return useQuery({ queryKey: queryKeys.model.summary, queryFn: () => model.summary(), staleTime: 10 * 60_000 })
}
