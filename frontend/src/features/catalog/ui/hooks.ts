import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import { Catalog } from '@/features/catalog/domain/catalog'

export function useCatalog() {
  const { catalog: gateway } = useContainer()
  const q = useQuery({ queryKey: queryKeys.catalog.all, queryFn: () => gateway.catalog(), staleTime: 10 * 60_000 })
  const catalog = useMemo(() => (q.data ? new Catalog(q.data) : null), [q.data])
  return { ...q, catalog }
}
