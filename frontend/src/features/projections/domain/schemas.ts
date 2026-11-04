import { z } from 'zod'
import { unitsSchema } from '@/features/catalog/domain/schemas'
import { isoDateSchema } from '@/shared/domain/schemas'

/** Contratos de la API de proyecciones y ventas, validados al recibirlos. */

export const projectionSchema = z.object({
  id: z.string(),
  submission_id: z.string(),
  seller: z.string(),
  date: isoDateSchema,
  category: z.string(),
  status: z.string(),
  total_units: z.number().int(),
  total_kg: z.number(),
  submitted_at: z.string(),
  units: unitsSchema,
})
export type Projection = z.infer<typeof projectionSchema>

export const dailyUnitsSchema = z.object({ seller: z.string(), date: isoDateSchema, units: unitsSchema })
export type DailyUnits = z.infer<typeof dailyUnitsSchema>

export const suggestionSchema = z.object({ method: z.string(), days: z.array(dailyUnitsSchema) })
export type Suggestion = z.infer<typeof suggestionSchema>

export const submissionResultSchema = z.object({
  submission_id: z.string(),
  days: z.number().int(),
  total_units: z.number().int(),
  total_kg: z.number(),
})
export type SubmissionResult = z.infer<typeof submissionResultSchema>

/** Envío pendiente en la cola del dispositivo (se reintenta hasta que el servidor lo acepta). */
export const submissionSchema = z.object({
  submission_id: z.string(),
  seller: z.string(),
  category: z.string(),
  days: z.array(z.object({ date: isoDateSchema, units: unitsSchema })).min(1),
  created_at: z.string(),
  error: z.string().nullable().optional(),
})
export type Submission = z.infer<typeof submissionSchema>

export const CONFIRMED = 'confirmed'
