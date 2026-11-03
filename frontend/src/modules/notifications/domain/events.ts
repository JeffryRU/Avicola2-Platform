import { z } from 'zod'
import { notificationSchema } from '@/modules/notifications/domain/notifications'

/**
 * Eventos del canal en tiempo real (GET /api/events, Server-Sent Events). Solo avisan que algo
 * cambió: los datos se vuelven a pedir por la API.
 */
export const realtimeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('notification'), data: notificationSchema }),
  z.object({
    type: z.literal('projections.changed'),
    data: z.object({ seller: z.string(), dates: z.array(z.string()) }),
  }),
  z.object({ type: z.literal('session.revoked'), data: z.object({ reason: z.string() }) }),
])
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>
export const REALTIME_EVENT_TYPES = ['notification', 'projections.changed', 'session.revoked'] as const
