import { z } from 'zod'
import { dShort, rangeDates, today, type IsoDate } from '@/core/domain/dates'
import { sumUnits } from '@/modules/planning/domain/catalog'
import { isoDateSchema } from '@/modules/planning/domain/schemas'

export const MAX_DAYS = 7
export const MAX_UNITS = 9999

/** Borrador de una nueva proyección (paso 1: fechas y categoría; paso 2: unidades). */
export const draftSchema = z.object({
  step: z.union([z.literal(0), z.literal(1)]),
  start: isoDateSchema,
  days: z.number().int().min(1).max(MAX_DAYS),
  category: z.string().min(1),
  units: z.record(isoDateSchema, z.record(z.string(), z.number().int().min(0).max(MAX_UNITS))),
  tried: z.boolean().default(false),
})
export type Draft = z.infer<typeof draftSchema>

export const newDraft = (start: IsoDate = today(), category = ''): Draft => ({
  step: 0,
  start,
  days: 3,
  category,
  units: {},
  tried: false,
})

export const draftDates = (d: Draft) => rangeDates(d.start, d.days)

/** Reglas para enviar: fechas desde hoy y al menos una unidad en cada día. */
export function submittableDraft(ref: IsoDate = today()) {
  return draftSchema.superRefine((d, ctx) => {
    if (d.start < ref) ctx.addIssue({ code: 'custom', path: ['start'], message: 'Elige hoy o una fecha futura.' })
    for (const date of draftDates(d)) {
      if (sumUnits(d.units[date]) === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['units', date],
          message: `Ingresa al menos un producto para ${dShort(date)}.`,
        })
      }
    }
  })
}

/** Días sin unidades (para marcarlos en rojo). */
export function emptyDays(d: Draft): IsoDate[] {
  return draftDates(d).filter((date) => sumUnits(d.units[date]) === 0)
}

/** Lee lo que el usuario escribe en una celda: solo dígitos, máximo 4. */
export function parseCell(raw: string): number | null {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  return digits === '' ? null : Number(digits)
}
