import { z } from 'zod'
import type { IsoDate } from '@/shared/domain/dates'
import { isoDateSchema } from '@/shared/domain/schemas'

/** Estados de una habilitación de edición (los define el backend). */
export const UNLOCK_STATUSES = ['requested', 'approved', 'rejected', 'closed'] as const
export type UnlockStatus = (typeof UNLOCK_STATUSES)[number]
export type UnlockAction = 'approve' | 'reject' | 'close'

export const unlockSchema = z.object({
  id: z.number().int(),
  seller: z.string(),
  date: isoDateSchema,
  reason: z.string(),
  status: z.enum(UNLOCK_STATUSES),
  requested_at: z.string(),
  decided_by: z.string().nullable(),
  decided_at: z.string().nullable(),
})
export type Unlock = z.infer<typeof unlockSchema>

export const cutoffSchema = z.object({
  cutoff_time: z.string(),
  days_before: z.number().int(),
  open_days: z.number().int(),
})
export type Cutoff = z.infer<typeof cutoffSchema>

export const editingDaySchema = z.object({
  date: isoDateSchema,
  // Con la zona del negocio ("2026-11-05T07:00:00-05:00"): la hora se lee tal cual.
  closes_at: z.string(),
  open: z.boolean(),
  unlock: unlockSchema.nullable(),
})
export type EditingDay = z.infer<typeof editingDaySchema>

export const editingWindowSchema = z.object({ policy: cutoffSchema, days: z.array(editingDaySchema) })
export type EditingWindow = z.infer<typeof editingWindowSchema>

/** Formulario «Pedir habilitación» (mismas reglas que el backend). */
export const unlockRequestSchema = z.object({
  date: isoDateSchema,
  reason: z
    .string()
    .transform((v) => v.split(/\s+/).filter(Boolean).join(' '))
    .pipe(z.string().min(1, 'Indica el motivo.').max(300, 'Como máximo 300 caracteres.')),
})

/** Formulario «Horario de corte». */
export const cutoffFormSchema = z.object({
  cutoff_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:MM, por ejemplo 07:00.'),
  days_before: z.number().int().min(0).max(7),
})

/** "2026-11-05T07:00:00-05:00" → "07:00" (sin pasar por la zona del navegador). */
export const timeOf = (iso: string) => iso.slice(11, 16)
export const dateOf = (iso: string): IsoDate => iso.slice(0, 10)

/** Días elegidos que están cerrados y sin habilitación. */
export function closedDays(window: EditingWindow | undefined, dates: IsoDate[]): IsoDate[] {
  if (!window) return []
  return dates.filter((d) => window.days.find((x) => x.date === d)?.open === false)
}

/** Días que el vendedor puede registrar ahora mismo (en orden). */
export const openDates = (window: EditingWindow) => window.days.filter((d) => d.open).map((d) => d.date)

/** Días que se pueden elegir en Registrar (hoy … pasado mañana). */
export const windowDates = (window: EditingWindow) => window.days.map((d) => d.date)

const ORDER: Record<UnlockStatus, number> = { requested: 0, approved: 1, rejected: 2, closed: 2 }

/** Pendientes primero, luego las habilitadas y al final el historial; dentro, lo más reciente arriba. */
export const sortUnlocks = (list: Unlock[]) =>
  [...list].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.id - a.id)
