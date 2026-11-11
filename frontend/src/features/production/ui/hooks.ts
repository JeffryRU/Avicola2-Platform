import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import type { IsoDate } from '@/shared/domain/dates'
import type { ProductionEntry } from '@/features/production/domain/production'

const keys = { all: ['production'] as const }

export function useProduction(from: IsoDate, to: IsoDate) {
  const { production } = useContainer()
  return useQuery({ queryKey: [...keys.all, from, to], queryFn: () => production.list(from, to) })
}

export function useRegisterProduction() {
  const { production } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ day, lines }: { day: IsoDate; lines: ProductionEntry[] }) => production.register(day, lines),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.all })
      // La estimación de llegada de la saca usa esta historia.
      void client.invalidateQueries({ queryKey: ['saca'] })
    },
  })
}
