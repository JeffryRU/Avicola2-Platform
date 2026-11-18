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

/**
 * Tamaño máximo desde la app: la subida pasa por Vercel, que corta los cuerpos de más de 4,5 MB.
 * Un día o una semana de ARIS pesan bastante menos; lo más grande va por Drive, Telegram o WhatsApp.
 */
export const ARIS_MAX_MB = 4
export const ARIS_MAX_BYTES = ARIS_MAX_MB * 1024 * 1024
export const tooBig = (file: Pick<File, 'size'>) => file.size > ARIS_MAX_BYTES

/** Formatos que acepta la carga (el mismo export de ARIS). */
export const ARIS_ACCEPT = '.xlsx,.xlsm,.csv'

/** ¿Hay que mostrar el aviso? Solo cuando faltan días (o nunca se cargó nada). */
export const needsUpload = (s: ArisStatus) => s.level !== 'ok'
