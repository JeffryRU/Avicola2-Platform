import { useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { addDays, today, weekStart } from '@/shared/domain/dates'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { myDays } from '@/features/projections/domain/aggregation'

export const keys = {
  window: (from: string, to: string) => ['window', from, to] as const,
}

/** Ventana de datos que usa toda la app: 3 semanas atrás y 2 adelante (como el mockup). */
export function dataWindow(ref = today()) {
  const ws = weekStart(ref)
  return { from: addDays(ws, -21), to: addDays(ws, 13) }
}

/** Proyecciones y ventas de todos los vendedores en la ventana de datos. */
export function useWindowData() {
  const { projections: gateway } = useContainer()
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
