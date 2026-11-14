import { useMemo, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import { addDays, today, weekStart } from '@/shared/domain/dates'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { myDays } from '@/features/projections/domain/aggregation'
import type { Catalog } from '@/features/catalog/domain/catalog'
import type { Draft } from '@/features/projections/domain/draft'

/** Ventana de datos que usa toda la app: 3 semanas atrás y 2 adelante (como el mockup). */
export function dataWindow(ref = today()) {
  const ws = weekStart(ref)
  return { from: addDays(ws, -21), to: addDays(ws, 13) }
}

/** Proyecciones y ventas de todos los vendedores en la ventana de datos. */
export function useWindowData() {
  const { from, to } = dataWindow()
  return useRangeData(from, to)
}

/** Proyecciones y ventas de un rango (comparte caché con la ventana cuando coinciden). */
export function useRangeData(from: string, to: string) {
  const { projections: gateway } = useContainer()
  return useQuery({
    queryKey: queryKeys.projections.range(from, to),
    queryFn: async () => {
      const [projections, sales] = await Promise.all([gateway.projections({ from, to }), gateway.sales({ from, to })])
      return { projections, sales }
    },
  })
}

export function useQueue() {
  const { queue } = useContainer()
  return useSyncExternalStore(
    (cb) => queue.subscribe(cb),
    () => queue.list(),
  )
}

/** Proyecciones propias por fecha (servidor + cola offline). */
/** Días del vendedor con sesión, o de otro (el supervisor registrando por él). */
export function useMyDays(username?: string) {
  const session = useRequiredSession()
  const data = useWindowData()
  const queue = useQueue()
  const owner = username ?? session.seller.username
  const days = useMemo(() => myDays(data.data?.projections ?? [], queue, owner), [data.data, queue, owner])
  return { days, isLoading: data.isLoading, error: data.error }
}

/**
 * Reenvía la cola offline de quien tiene la sesión (POST /projections por cada envío pendiente).
 * Si algo llegó, refresca las proyecciones; `mutateAsync` espera ese refresco.
 */
export function useFlushQueue() {
  const { planning } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (seller: string) => planning.flush(seller),
    onSuccess: async (r) => {
      if (r.sent) await client.invalidateQueries({ queryKey: queryKeys.projections.all })
    },
  })
}

/** Envía una proyección (con cola offline: sin conexión queda pendiente) y refresca los datos. */
export function useSubmitProjection() {
  const { planning } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      draft,
      catalog,
      owner,
      author,
    }: {
      draft: Draft
      catalog: Catalog
      owner: string
      author: string
    }) => planning.submit(draft, catalog, owner, author),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.projections.all }),
  })
}

/** Sugerencia con el historial: se pide al tocar el botón y siempre fresca (GET /suggestions). */
export function useSuggestion() {
  const { projections } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      category,
      start,
      days,
      seller,
    }: {
      category: string
      start: string
      days: number
      seller?: string
    }) =>
      client.query({
        queryKey: queryKeys.suggestions.get(category, start, days, seller),
        queryFn: () => projections.suggestions(category, start, days, seller),
        staleTime: 0,
      }),
  })
}
