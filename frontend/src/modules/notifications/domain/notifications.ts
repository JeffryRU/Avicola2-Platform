import { z } from 'zod'
import { diffDays, dShort, toIso } from '@/core/domain/dates'

/** Notificación guardada en el servidor (GET /api/notifications). */
export const notificationSchema = z.object({
  id: z.number().int(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  created_at: z.string(),
  read_at: z.string().nullable(),
})
export type AppNotification = z.infer<typeof notificationSchema>

export const notificationPageSchema = z.object({ items: z.array(notificationSchema), unread: z.number().int() })
export type NotificationPage = z.infer<typeof notificationPageSchema>

/** Tipos conocidos; uno nuevo del servidor se muestra igual, con el estilo genérico. */
export type NotificationKind = 'projection_reminder' | 'projection_submitted' | 'announcement'

/** Solo se siguen enlaces internos de la app (nunca una URL externa recibida del servidor). */
export const safeLink = (link: string | null) => (link && /^\/(?!\/)/.test(link) ? link : null)

/** "Hace 5 min", "Hoy 08:30", "Ayer 17:10" o "Lun 03/11". */
export function whenLabel(createdAt: string, now: Date = new Date()): string {
  const at = new Date(createdAt)
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000)
  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `Hace ${minutes} min`
  const time = at.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  const days = diffDays(toIso(now), toIso(at))
  if (days === 0) return `Hoy ${time}`
  if (days === 1) return `Ayer ${time}`
  return dShort(toIso(at))
}
