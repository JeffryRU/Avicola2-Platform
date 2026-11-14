import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import { today, type IsoDate } from '@/shared/domain/dates'
import type { UnlockAction } from '@/features/editing/domain/editing'

/** Días que se pueden registrar y hasta cuándo (se refresca cada minuto: el corte llega solo). */
export function useEditingWindow() {
  const { editing } = useContainer()
  return useQuery({ queryKey: queryKeys.editing.window, queryFn: () => editing.window(), refetchInterval: 60_000 })
}

/** Primer día que se puede registrar (mañana, según el servidor); mientras carga, hoy. */
export function useFirstEditableDay(): IsoDate {
  return useEditingWindow().data?.days[0]?.date ?? today()
}

export function useUnlocks(enabled = true) {
  const { editing } = useContainer()
  return useQuery({ queryKey: queryKeys.editing.unlocks, queryFn: () => editing.unlocks(), enabled })
}

function useRefresh() {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: queryKeys.editing.all })
}

export function useRequestUnlock() {
  const { editing } = useContainer()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ date, reason }: { date: IsoDate; reason: string }) => editing.request(date, reason),
    onSuccess: refresh,
  })
}

export function useDecideUnlock() {
  const { editing } = useContainer()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: UnlockAction }) => editing.decide(id, action),
    onSuccess: refresh,
  })
}

export function useUpdateCutoff() {
  const { editing } = useContainer()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ time, daysBefore, enabled }: { time: string; daysBefore: number; enabled: boolean }) =>
      editing.updateCutoff(time, daysBefore, enabled),
    onSuccess: refresh,
  })
}

export function useGrantEditing() {
  const { editing } = useContainer()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ username, dates }: { username: string; dates: IsoDate[] }) => editing.grant(username, dates),
    onSuccess: refresh,
  })
}

export function useRevokeEditing() {
  const { editing } = useContainer()
  const refresh = useRefresh()
  return useMutation({ mutationFn: (username: string) => editing.revoke(username), onSuccess: refresh })
}
