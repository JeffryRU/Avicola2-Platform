import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { paths } from '@/app/routes'
import { isSupervisor } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'

export function useSellers() {
  const { sellers } = useContainer()
  return useQuery({ queryKey: ['sellers'], queryFn: () => sellers.sellers(), staleTime: 10 * 60_000 })
}

/** A dónde lleva tocar un día: el vendedor ve su proyección; el supervisor, la de todo el equipo. */
export function useDayPath(): (date: string) => string {
  return isSupervisor(useRequiredSession().seller) ? paths.teamDay : paths.day
}
