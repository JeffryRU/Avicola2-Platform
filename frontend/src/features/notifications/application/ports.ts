import type { RealtimeEvent } from '@/features/notifications/domain/events'
import type { NotificationPage } from '@/features/notifications/domain/notifications'

export interface NotificationsGateway {
  list(): Promise<NotificationPage>
  /** Sin `ids` marca todas como leídas. */
  markRead(ids?: number[]): Promise<void>
}

export interface StreamHandlers {
  /** El canal se cerró del todo (servidor caído o sesión rechazada). */
  onLost?: () => void
  /** Se reconectó tras un corte: pudo perderse algo en el intervalo. */
  onReconnect?: () => void
}

/** Canal en tiempo real. `connect` devuelve la función para desconectarse. */
export interface EventStream {
  connect(onEvent: (event: RealtimeEvent) => void, handlers?: StreamHandlers): () => void
}
