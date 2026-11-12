import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import type { IsoDate } from '@/shared/domain/dates'

/** Saca calculada el día `day` (hoy por defecto en la pantalla). */
export function useSacaPlan(day: IsoDate) {
  const { saca } = useContainer()
  return useQuery({ queryKey: queryKeys.saca.plan(day), queryFn: () => saca.plan(day) })
}

/** Guarda el plus por tipo y recalcula todos los planes de saca. */
export function useSetSacaPlus() {
  const { saca } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (plus: Record<string, number>) => saca.setPlus(plus),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.saca.all }),
  })
}
