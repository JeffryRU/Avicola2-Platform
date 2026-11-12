import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import type { IsoDate } from '@/shared/domain/dates'
import type { StockEntry } from '@/features/stock/domain/stock'

export function useStock(from: IsoDate, to: IsoDate) {
  const { stock } = useContainer()
  return useQuery({ queryKey: queryKeys.stock.range(from, to), queryFn: () => stock.list(from, to) })
}

export function useStockOptions() {
  const { stock } = useContainer()
  return useQuery({ queryKey: queryKeys.stock.options, queryFn: () => stock.options(), staleTime: 10 * 60_000 })
}

export function useRegisterStock() {
  const { stock } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ day, location, lines }: { day: IsoDate; location: string; lines: StockEntry[] }) =>
      stock.register(day, location, lines),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.stock.all })
      // La saca descuenta este stock.
      void client.invalidateQueries({ queryKey: queryKeys.saca.all })
    },
  })
}
