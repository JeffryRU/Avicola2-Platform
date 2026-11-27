import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import type { IsoDate } from '@/shared/domain/dates'

/** Cambios de proyecciones en un rango; `seller` solo para el supervisor (vacío = todo el equipo). */
export function useHistory(from: IsoDate, to: IsoDate, seller?: string) {
  const { history } = useContainer()
  return useQuery({
    queryKey: queryKeys.history.list(from, to, seller),
    queryFn: () => history.changes(from, to, seller),
  })
}
