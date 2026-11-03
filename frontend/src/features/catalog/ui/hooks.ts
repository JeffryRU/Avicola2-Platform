import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { Catalog } from '@/features/catalog/domain/catalog'

export function useCatalog() {
  const { catalog: gateway } = useContainer()
  const q = useQuery({ queryKey: ['catalog'], queryFn: () => gateway.catalog(), staleTime: 10 * 60_000 })
  const catalog = useMemo(() => (q.data ? new Catalog(q.data) : null), [q.data])
  return { ...q, catalog }
}
