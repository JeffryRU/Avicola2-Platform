import { z } from 'zod'

/** Contratos de la API de planificación, validados al recibirlos. */
export const isoDateSchema = z.iso.date({ message: 'Fecha inválida.' })
export const unitsSchema = z.record(z.string(), z.number().int().nonnegative())
export type Units = z.infer<typeof unitsSchema>

export const productSchema = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  kg_per_unit: z.number().positive(),
  sort_order: z.number().int(),
  subcategory: z.string().nullish(),
})
export type Product = z.infer<typeof productSchema>

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

export const dbStatusSchema = z.object({
  database: z.boolean(),
  tables: z.boolean(),
  dialect: z.string(),
  database_name: z.string().nullable(),
  schema: z.string().nullable(),
  error: z.string().optional(),
})
export type DbStatus = z.infer<typeof dbStatusSchema>

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
