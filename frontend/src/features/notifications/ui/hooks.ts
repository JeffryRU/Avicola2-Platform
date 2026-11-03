import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useContainer } from '@/app/di'
import { useSession } from '@/features/auth/ui/use-session'
import type { NotificationPage } from '@/features/notifications/domain/notifications'

export const notificationKeys = { all: ['notifications'] as const }
const EMPTY: NotificationPage = { items: [], unread: 0 }

/** Notificaciones del usuario. Se actualizan solas con el canal en tiempo real. */
export function useNotifications() {
  const { notifications } = useContainer()
  const session = useSession()
  const query = useQuery({
    queryKey: notificationKeys.all,
    queryFn: () => notifications.list(),
    enabled: !!session && !session.must_change_password,
    staleTime: 60_000,
  })
  return { ...(query.data ?? EMPTY), isPending: query.isPending, error: query.error }
}

export const useUnreadCount = () => useNotifications().unread

export function useMarkRead() {
  const { notifications } = useContainer()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (ids?: number[]) => notifications.markRead(ids),
    onSuccess: () => void client.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

/**
 * Conecta el canal en tiempo real mientras haya sesión: nuevas notificaciones (aviso y lista),
 * proyecciones de otros (dashboards) y sesión cerrada por el supervisor.
 */
export function useRealtime() {
  const { events, auth } = useContainer()
  const client = useQueryClient()
  const session = useSession()
  const user = session && !session.must_change_password ? session.seller.username : null

  useEffect(() => {
    if (!user) return
    return events.connect(
      (event) => {
        switch (event.type) {
          case 'notification':
            void client.invalidateQueries({ queryKey: notificationKeys.all })
            toast(event.data.title, { description: event.data.body })
            break
          case 'projections.changed':
            void client.invalidateQueries({ queryKey: ['window'] })
            break
          case 'session.revoked':
            toast.error(event.data.reason, { description: 'Vuelve a iniciar sesión.' })
            auth.expire()
            break
        }
      },
      {
        // Si el canal se cae del todo, puede ser que la sesión ya no valga: se confirma.
        onLost: () => void auth.verify(),
        onReconnect: () => {
          void client.invalidateQueries({ queryKey: notificationKeys.all })
          void client.invalidateQueries({ queryKey: ['window'] })
        },
      },
    )
  }, [user, events, auth, client])
}
