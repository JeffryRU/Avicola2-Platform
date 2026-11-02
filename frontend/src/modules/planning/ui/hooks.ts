import { useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { addDays, today, weekStart } from '@/core/domain/dates'
import { useRequiredSession } from '@/modules/auth/ui/use-session'
import { myDays } from '@/modules/planning/domain/aggregation'
import { Catalog } from '@/modules/planning/domain/catalog'

export const keys = {
  catalog: ['catalog'] as const,
  sellers: ['sellers'] as const,
  status: ['status'] as const,
  window: (from: string, to: string) => ['window', from, to] as const,
}

/** Ventana de datos que usa toda la app: 3 semanas atrás y 2 adelante (como el mockup). */
export function dataWindow(ref = today()) {
  const ws = weekStart(ref)
  return { from: addDays(ws, -21), to: addDays(ws, 13) }
}

export function useCatalog() {
  const { gateway } = useContainer()
  const q = useQuery({ queryKey: keys.catalog, queryFn: gateway.catalog, staleTime: 10 * 60_000 })
  const catalog = useMemo(() => (q.data ? new Catalog(q.data) : null), [q.data])
  return { ...q, catalog }
}

export function useSellers() {
  const { gateway } = useContainer()
  return useQuery({ queryKey: keys.sellers, queryFn: gateway.sellers, staleTime: 10 * 60_000 })
}

export function useStatus() {
  const { gateway } = useContainer()
  return useQuery({ queryKey: keys.status, queryFn: gateway.status, retry: false })
}

/** Proyecciones y ventas de todos los vendedores en la ventana de datos. */
export function useWindowData() {
  const { gateway } = useContainer()
  const { from, to } = dataWindow()
  return useQuery({
    queryKey: keys.window(from, to),
    queryFn: async () => {
      const [projections, sales] = await Promise.all([gateway.projections({ from, to }), gateway.sales({ from, to })])
      return { projections, sales }
    },
  })
}

export function useQueue() {
  const { queue } = useContainer()
  return useSyncExternalStore(queue.subscribe, queue.list)
}

/** Proyecciones propias por fecha (servidor + cola offline). */
export function useMyDays() {
  const session = useRequiredSession()
  const data = useWindowData()
  const queue = useQueue()
  const days = useMemo(
    () => myDays(data.data?.projections ?? [], queue, session.seller.username),
    [data.data, queue, session.seller.username],
  )
  return { days, isLoading: data.isLoading, error: data.error }
}
