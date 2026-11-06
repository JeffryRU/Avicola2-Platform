import { z } from 'zod'
import { addDays, dShort, rangeDates, today, type IsoDate } from '@/shared/domain/dates'
import { sumUnits } from '@/features/catalog/domain/catalog'
import { isoDateSchema } from '@/shared/domain/schemas'

export const MAX_DAYS = 7
export const MAX_UNITS = 9999

/** Borrador de una nueva proyección (paso 1: fechas y categoría; paso 2: unidades). */
export const draftSchema = z.object({
  step: z.union([z.literal(0), z.literal(1)]),
  start: isoDateSchema,
  days: z.number().int().min(1).max(MAX_DAYS),
  category: z.string().min(1),
  // Filtra los productos que se ven (Brasa chica...); null = todos. Lo enviado sigue siendo el día
  // completo de la categoría: lo oculto conserva lo ya confirmado.
  subcategory: z.string().nullable().default(null),
  units: z.record(isoDateSchema, z.record(z.string(), z.number().int().min(0).max(MAX_UNITS))),
  tried: z.boolean().default(false),
})
export type Draft = z.infer<typeof draftSchema>

/** Las proyecciones son de los días siguientes: por defecto empieza mañana. */
export const newDraft = (start: IsoDate = addDays(today(), 1), category = ''): Draft => ({
  step: 0,
  start,
  days: 3,
  category,
  subcategory: null,
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
