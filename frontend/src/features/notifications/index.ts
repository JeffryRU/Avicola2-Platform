/** Punto de entrada público de la feature: otras features y app/ importan solo desde aquí (ADR 0008). */
export type { EventStream, NotificationsGateway, StreamHandlers } from '@/features/notifications/application/ports'
export { useRealtime, useUnreadCount } from '@/features/notifications/ui/hooks'
