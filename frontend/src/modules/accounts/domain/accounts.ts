import { z } from 'zod'
import { roleSchema } from '@/modules/auth/domain/session'

/** Cuenta vista por el supervisor (GET /api/admin/accounts). */
export const adminAccountSchema = z.object({
  username: z.string(),
  name: z.string(),
  zone: z.string().nullable(),
  role: roleSchema,
  is_active: z.boolean(),
  must_change_password: z.boolean(),
  locked_until: z.string().nullable(),
})
export type AdminAccount = z.infer<typeof adminAccountSchema>

/** La contraseña temporal llega una sola vez: se muestra y no se guarda en ningún lado. */
export const newCredentialsSchema = z.object({ account: adminAccountSchema, temporary_password: z.string() })
export type NewCredentials = z.infer<typeof newCredentialsSchema>

/** Formulario "Nuevo usuario" (mismas reglas que el backend). */
export const newAccountSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,30}$/, 'De 3 a 30 caracteres: minúsculas, números, punto, guion o _.'),
  name: z.string().trim().min(1, 'Ingresa el nombre.').max(100),
  zone: z
    .string()
    .trim()
    .max(50)
    .transform((v) => v || null),
  role: roleSchema,
})
export type NewAccount = z.infer<typeof newAccountSchema>

export type AccountState = 'active' | 'inactive' | 'locked' | 'must_change'

export function accountState(account: AdminAccount, now: Date): AccountState {
  if (!account.is_active) return 'inactive'
  if (account.locked_until && new Date(account.locked_until) > now) return 'locked'
  if (account.must_change_password) return 'must_change'
  return 'active'
}
