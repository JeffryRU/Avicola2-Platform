import type { RealtimeEvent } from '@/modules/notifications/domain/events'
import type { NotificationPage } from '@/modules/notifications/domain/notifications'

export interface NotificationsGateway {
  list(): Promise<NotificationPage>
  /** Sin `ids` marca todas como leídas. */
  markRead(ids?: number[]): Promise<void>
}

/** Canal en tiempo real. `connect` devuelve la función para desconectarse. */
export interface EventStream {
  connect(onEvent: (event: RealtimeEvent) => void, onLost?: () => void): () => void
}
