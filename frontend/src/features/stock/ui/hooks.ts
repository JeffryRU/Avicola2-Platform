import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import type { IsoDate } from '@/shared/domain/dates'
import {
  DEFAULT_LOCATIONS,
  DEFAULT_LOT_DAYS,
  DEFAULT_PRODUCTS,
  DEFAULT_QUALITY_B,
} from '@/features/catalog/domain/defaults'
import { stockOptionsSchema, type StockEntry, type StockOptions } from '@/features/stock/domain/stock'

export function useStock(from: IsoDate, to: IsoDate) {
  const { stock } = useContainer()
  return useQuery({ queryKey: queryKeys.stock.range(from, to), queryFn: () => stock.list(from, to) })
}

const OPTIONS_KEY = 'nv_stock_options'

/** Artículos y ubicaciones del stock. Sin respuesta del servidor: lo último recibido en este
 *  equipo o, si nunca llegó, el catálogo de respaldo. */
export function useStockOptions() {
  const { stock, preferences } = useContainer()
  const q = useQuery({
    queryKey: queryKeys.stock.options,
    queryFn: () => stock.options(),
    staleTime: 10 * 60_000,
  })
  useEffect(() => {
    if (q.data) preferences.set(OPTIONS_KEY, q.data)
  }, [q.data, preferences])
  const options = useMemo<StockOptions>(
    () =>
      q.data ??
      preferences.get(OPTIONS_KEY, stockOptionsSchema) ?? {
        items: [...DEFAULT_PRODUCTS, ...DEFAULT_QUALITY_B],
        locations: DEFAULT_LOCATIONS,
        lot_days: DEFAULT_LOT_DAYS,
      },
    [q.data, preferences],
  )
  return { ...q, options }
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
