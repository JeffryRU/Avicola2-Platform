import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import type { IsoDate } from '@/shared/domain/dates'
import type { UnlockAction } from '@/features/editing/domain/editing'

export const editingKeys = {
  all: ['editing'] as const,
  window: ['editing', 'window'] as const,
  unlocks: ['editing', 'unlocks'] as const,
}

/** Días que se pueden registrar y hasta cuándo (se refresca cada minuto: el corte llega solo). */
export function useEditingWindow() {
  const { editing } = useContainer()
  return useQuery({ queryKey: editingKeys.window, queryFn: () => editing.window(), refetchInterval: 60_000 })
}

export function useUnlocks(enabled = true) {
  const { editing } = useContainer()
  return useQuery({ queryKey: editingKeys.unlocks, queryFn: () => editing.unlocks(), enabled })
}

function useRefresh() {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: editingKeys.all })
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
    mutationFn: ({ time, daysBefore }: { time: string; daysBefore: number }) => editing.updateCutoff(time, daysBefore),
    onSuccess: refresh,
  })
}
