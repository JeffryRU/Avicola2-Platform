import { z } from 'zod'
import { addDays, diffDays, dShort, toIso, type IsoDate } from '@/shared/domain/dates'

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
export type NotificationKind =
  | 'projection_reminder'
  | 'projection_submitted'
  | 'announcement'
  | 'edit_requested'
  | 'edit_decided'
  | 'projection_missed'

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

/** Días de las notificaciones que se ven (ambos incluidos); null = las últimas, sin filtro. */
export interface NotificationRange {
  from: IsoDate
  to: IsoDate
}

/** Atajos del filtro por día. `custom`: el rango que se elija. */
export const RANGE_PRESETS = ['all', 'today', 'yesterday', 'week', 'custom'] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: IsoDate): NotificationRange | null {
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'yesterday') return { from: addDays(today, -1), to: addDays(today, -1) }
  if (preset === 'week') return { from: addDays(today, -6), to: today }
  return null
}

/** Qué atajo corresponde a un rango (o `custom` si no es ninguno). */
export function presetOf(range: NotificationRange | null, today: IsoDate): RangePreset {
  if (!range) return 'all'
  const match = (['today', 'yesterday', 'week'] as const).find((p) => {
    const r = presetRange(p, today)
    return r?.from === range.from && r.to === range.to
  })
  return match ?? 'custom'
}

/** Día (en la hora del equipo) en que llegó una notificación. */
export const dayOf = (n: AppNotification): IsoDate => toIso(new Date(n.created_at))

/** Si una notificación cae en el rango (también filtra lo ya cargado, sin esperar al servidor). */
export const inRange = (n: AppNotification, range: NotificationRange | null) =>
  !range || (dayOf(n) >= range.from && dayOf(n) <= range.to)

/** Notificaciones agrupadas por día, en el orden en que vienen (las más nuevas primero). */
export function byDay(items: AppNotification[]): { day: IsoDate; items: AppNotification[] }[] {
  const out: { day: IsoDate; items: AppNotification[] }[] = []
  for (const n of items) {
    const day = dayOf(n)
    const last = out.at(-1)
    if (last?.day === day) last.items.push(n)
    else out.push({ day, items: [n] })
  }
  return out
}
