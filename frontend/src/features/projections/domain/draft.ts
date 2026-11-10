import { z } from 'zod'
import { addDays, dShort, rangeDates, today, type IsoDate } from '@/shared/domain/dates'
import { sumUnits } from '@/features/catalog/domain/catalog'
import type { Units } from '@/features/catalog/domain/schemas'
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

/** Hoja vigente de un día del borrador (misma categoría). */
export interface PreviousSheet {
  date: IsoDate
  sheet: number
  units: Units
}

/**
 * INS-06: cada registro abre una hoja nueva. Devuelve las hojas vigentes de los días del borrador
 * (misma categoría): la que se envíe ahora será la siguiente y la reemplaza, no se suma.
 */
export function previousSheets(
  draft: Draft,
  days: ReadonlyMap<IsoDate, { category: string; units: Units; sheet?: number }>,
): PreviousSheet[] {
  return draftDates(draft).flatMap((date) => {
    const day = days.get(date)
    return day?.category === draft.category ? [{ date, sheet: day.sheet ?? 1, units: day.units }] : []
  })
}

const pick = (units: Units, keep: (id: string) => boolean): Units =>
  Object.fromEntries(Object.entries(units).filter(([id]) => keep(id)))

/**
 * Abre la hoja nueva de cada día: en blanco para los productos que se ven. Los que no se ven
 * (otro tamaño de brasa) conservan lo de la hoja anterior, porque se envía el día completo.
 */
export function openNewSheets(draft: Draft, previous: PreviousSheet[], visible: ReadonlySet<string>): Draft {
  const before = new Map(previous.map((p) => [p.date, p.units]))
  const units = { ...draft.units }
  for (const date of draftDates(draft)) {
    units[date] ??= pick(before.get(date) ?? {}, (id) => !visible.has(id))
  }
  return { ...draft, units }
}

/** Copia a la hoja nueva lo de la anterior, solo en los días donde aún no se escribió nada visible. */
export function copyPreviousSheets(draft: Draft, previous: PreviousSheet[], visible: ReadonlySet<string>): Draft {
  const units = { ...draft.units }
  for (const p of previous) {
    const day = units[p.date] ?? {}
    if (!Object.keys(day).some((id) => visible.has(id))) {
      units[p.date] = { ...day, ...pick(p.units, (id) => visible.has(id)) }
    }
  }
  return { ...draft, units }
}
