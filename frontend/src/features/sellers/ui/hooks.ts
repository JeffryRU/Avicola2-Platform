import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys, REFERENCE_DATA_STALE_MS } from '@/shared/application/query-keys'
import { sellersOnly, type Seller } from '@/shared/domain/session'

/** Vendedores visibles para la sesión (filtros, Historial, Habilitaciones). */
export function useSellers() {
  const { sellers } = useContainer()
  return useQuery({
    queryKey: queryKeys.sellers.all,
    queryFn: () => sellers.sellers(),
    staleTime: REFERENCE_DATA_STALE_MS,
  })
}

/** Solo los vendedores (sin supervisión): filtros del equipo. */
export function useTeamSellers(): Seller[] {
  return sellersOnly(useSellers().data ?? [])
}
