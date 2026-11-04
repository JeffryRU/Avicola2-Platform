import { z } from 'zod'

/** Estado de la conexión con la base de datos (pantalla Conexión). */
export const dbStatusSchema = z.object({
  database: z.boolean(),
  tables: z.boolean(),
  dialect: z.string(),
  database_name: z.string().nullable(),
  schema: z.string().nullable(),
  error: z.string().optional(),
})
export type DbStatus = z.infer<typeof dbStatusSchema>
