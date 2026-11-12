import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import type { IsoDate } from '@/shared/domain/dates'
import type { StockEntry } from '@/features/stock/domain/stock'

const stockKeys = { all: ['stock'] as const }

export function useStock(from: IsoDate, to: IsoDate) {
  const { stock } = useContainer()
  return useQuery({ queryKey: [...stockKeys.all, from, to], queryFn: () => stock.list(from, to) })
}

export function useStockOptions() {
  const { stock } = useContainer()
  return useQuery({ queryKey: [...stockKeys.all, 'options'], queryFn: () => stock.options(), staleTime: 10 * 60_000 })
}

export function useRegisterStock() {
  const { stock } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ day, location, lines }: { day: IsoDate; location: string; lines: StockEntry[] }) =>
      stock.register(day, location, lines),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: stockKeys.all })
      // La saca descuenta este stock.
      void client.invalidateQueries({ queryKey: ['saca'] })
    },
  })
}
