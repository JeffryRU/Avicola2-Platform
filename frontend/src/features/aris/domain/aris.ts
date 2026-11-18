import { z } from 'zod'

/** Qué tan al día están los datos de ARIS (la venta real con la que aprende el modelo). */
export const arisStatusSchema = z.object({
  last_dispatch: z.string().nullable(),
  last_sales: z.string().nullable(),
  /** Días completos sin datos de despacho (hasta ayer: hoy aún se despacha). */
  missing_days: z.number().int().nonnegative(),
  level: z.enum(['ok', 'info', 'warning']),
  training_pending: z.boolean(),
})
export type ArisStatus = z.infer<typeof arisStatusSchema>

/** Resultado de cargar una hoja o archivo de ARIS. */
export const arisLoadSchema = z.object({
  kind: z.enum(['despacho', 'ventas']),
  rows: z.number().int(),
  skipped: z.number().int(),
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
})
export type ArisLoad = z.infer<typeof arisLoadSchema>
export const arisLoadsSchema = z.array(arisLoadSchema)

/** Formatos que acepta la carga (el mismo export de ARIS). */
export const ARIS_ACCEPT = '.xlsx,.xlsm,.csv'

/** ¿Hay que mostrar el aviso? Solo cuando faltan días (o nunca se cargó nada). */
export const needsUpload = (s: ArisStatus) => s.level !== 'ok'
