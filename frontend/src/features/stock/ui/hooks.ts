import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys, REFERENCE_DATA_STALE_MS } from '@/shared/application/query-keys'
import type { KeyValueStore } from '@/shared/application/ports'
import type { IsoDate } from '@/shared/domain/dates'
import { DEFAULT_PRODUCTS } from '@/features/catalog'
import { DEFAULT_LOCATIONS, DEFAULT_LOT_DAYS, DEFAULT_QUALITY_B } from '@/features/stock/domain/defaults'
import {
  defaultView,
  type StockEntry,
  type StockOptions,
  stockOptionsSchema,
  type StockView,
  stockViewSchema,
} from '@/features/stock/domain/stock'

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
    staleTime: REFERENCE_DATA_STALE_MS,
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

/** Clave de la vista del stock en el equipo (KeyValueStore). */
export const STOCK_VIEW_KEY = 'stock.view'

/** La vista guardada en el equipo o, si no hay o no sirve, la de partida. */
export const readStockView = (store: Pick<KeyValueStore, 'get'>, lotDays: number): StockView =>
  store.get(STOCK_VIEW_KEY, stockViewSchema) ?? defaultView(lotDays)

/** Cómo se mira el stock: se recuerda en este equipo hasta que se cambie. */
export function useStockView(lotDays: number) {
  const { preferences } = useContainer()
  const [view, setViewState] = useState<StockView | null>(null)
  const current = view ?? readStockView(preferences, lotDays)
  const setView = (patch: Partial<StockView>) => {
    const next = { ...current, ...patch }
    preferences.set(STOCK_VIEW_KEY, next)
    setViewState(next)
  }
  return [current, setView] as const
}
