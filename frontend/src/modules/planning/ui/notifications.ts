import { useMemo, useSyncExternalStore } from 'react'
import { useContainer } from '@/app/di'
import { today } from '@/core/domain/dates'
import type { ReadNotificationsRepository } from '@/modules/planning/application/ports'
import { buildNotifications } from '@/modules/planning/domain/notifications'
import { useMyDays } from '@/modules/planning/ui/hooks'

/** Estado "leído" compartido entre pantallas (menú, inicio y la lista). */
const stores = new WeakMap<ReadNotificationsRepository, ReturnType<typeof createStore>>()

function createStore(repo: ReadNotificationsRepository) {
  let read = repo.load()
  const listeners = new Set<() => void>()
  return {
    get: () => read,
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    markRead: (ids: string[]) => {
      read = [...new Set([...read, ...ids])]
      repo.save(read)
      listeners.forEach((l) => l())
    },
  }
}

export function useNotifications() {
  const { readNotifications } = useContainer()
  if (!stores.has(readNotifications)) stores.set(readNotifications, createStore(readNotifications))
  const store = stores.get(readNotifications)!
  const read = useSyncExternalStore(store.subscribe, store.get)
  const { days } = useMyDays()
  const list = useMemo(() => buildNotifications(today(), days.has(today())), [days])
  return { list, unread: list.filter((n) => !read.includes(n.id)), markRead: store.markRead }
}

export const useUnreadCount = () => useNotifications().unread.length
