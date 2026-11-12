import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import type { IsoDate } from '@/shared/domain/dates'
import type { SacaMethod } from '@/features/saca/domain/saca'

/** Plan de saca de un día con la forma de cálculo elegida. */
export function useSacaPlan(day: IsoDate, method: SacaMethod) {
  const { saca } = useContainer()
  return useQuery({ queryKey: queryKeys.saca.plan(day, method), queryFn: () => saca.plan(day, method) })
}

/** Guarda los factores por tipo y recalcula todos los planes de saca. */
export function useSetSacaFactors() {
  const { saca } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (factors: Record<string, number>) => saca.setFactors(factors),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.saca.all }),
  })
}
