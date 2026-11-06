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
  // Primer día de la ventana (1 = mañana) y si el bloqueo por horario está activo.
  starts_in: z.number().int().default(0),
  enabled: z.boolean().default(true),
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
  enabled: z.boolean(),
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

/** Días que se pueden elegir en Registrar (desde mañana, los días de la ventana). */
export const windowDates = (window: EditingWindow) => window.days.map((d) => d.date)

/** Si pasó la hora de corte del día (con el bloqueo activo), sin importar habilitaciones. */
export const pastCutoff = (window: EditingWindow, day: EditingDay, now: Date = new Date()) =>
  window.policy.enabled && new Date(day.closes_at).getTime() <= now.getTime()

/** Clave para reiniciar el formulario del corte cuando cambia lo guardado (p. ej., en otro equipo). */
export const policyKey = (p: Cutoff) => `${p.cutoff_time}|${String(p.days_before)}|${String(p.enabled)}`

/** Días que se marcan al habilitar: los que ya cerraron o, si ninguno, el primero de la ventana. */
export function defaultGrantDays(window: EditingWindow, now: Date = new Date()): IsoDate[] {
  const closed = window.days.filter((d) => pastCutoff(window, d, now)).map((d) => d.date)
  return closed.length ? closed : window.days.slice(0, 1).map((d) => d.date)
}

/** Habilitaciones vigentes por vendedor: la última de cada día, si está aprobada y no pasó. */
export function activeUnlocks(list: Unlock[], from: IsoDate): Map<string, Unlock[]> {
  const latest = new Map<string, Unlock>()
  for (const u of list) {
    const key = `${u.seller}|${u.date}`
    const seen = latest.get(key)
    if (!seen || u.id > seen.id) latest.set(key, u)
  }
  const bySeller = new Map<string, Unlock[]>()
  for (const u of latest.values()) {
    if (u.status !== 'approved' || u.date < from) continue
    bySeller.set(
      u.seller,
      [...(bySeller.get(u.seller) ?? []), u].sort((a, b) => a.date.localeCompare(b.date)),
    )
  }
  return bySeller
}

const ORDER: Record<UnlockStatus, number> = { requested: 0, approved: 1, rejected: 2, closed: 2 }

/** Pendientes primero, luego las habilitadas y al final el historial; dentro, lo más reciente arriba. */
export const sortUnlocks = (list: Unlock[]) =>
  [...list].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.id - a.id)
