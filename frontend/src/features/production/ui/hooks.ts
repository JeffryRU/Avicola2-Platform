import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import type { IsoDate } from '@/shared/domain/dates'
import type { ProductionEntry } from '@/features/production/domain/production'

export function useProduction(from: IsoDate, to: IsoDate) {
  const { production } = useContainer()
  return useQuery({ queryKey: queryKeys.production.range(from, to), queryFn: () => production.list(from, to) })
}

/** `weights`: peso esperado de la parvada por tipo, en el orden de los tipos (0 = el último anotado). */
export function useArrivalForecast(weights: number[] = []) {
  const { production } = useContainer()
  return useQuery({
    queryKey: queryKeys.production.forecast(weights),
    queryFn: () => production.forecast(weights),
    placeholderData: keepPreviousData,
  })
}

export function useRegisterProduction() {
  const { production } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      day,
      lines,
      weights,
    }: {
      day: IsoDate
      lines: ProductionEntry[]
      weights: Record<string, number>
    }) => production.register(day, lines, weights),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.production.all })
      // La estimación de llegada de la saca usa esta historia.
      void client.invalidateQueries({ queryKey: queryKeys.saca.all })
    },
  })
}
