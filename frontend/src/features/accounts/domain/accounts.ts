import { z } from 'zod'
import { roleSchema, type Role } from '@/features/auth/domain/session'
import type { AccountState } from '@/features/accounts/types/accounts'

export type { AccountState }

/** Cuenta vista por el supervisor (GET /api/admin/accounts). */
export const adminAccountSchema = z.object({
  username: z.string(),
  name: z.string(),
  zone: z.string().nullable(),
  // Texto libre: una cuenta con un rol que esta versión no conoce (dato antiguo, rol nuevo del
  // backend) se muestra tal cual en vez de dejar toda la pantalla Usuarios sin cargar.
  role: z.string(),
  is_active: z.boolean(),
  must_change_password: z.boolean(),
  locked_until: z.string().nullable(),
  // Lo que quien mira puede hacer con esta cuenta: lo decide el backend (domain/permissions.py).
  can_manage: z.boolean(),
  assignable_roles: z
    .array(z.string())
    .transform((list) => list.filter((r): r is Role => roleSchema.safeParse(r).success)),
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

export function accountState(account: AdminAccount, now: Date): AccountState {
  if (!account.is_active) return 'inactive'
  if (account.locked_until && new Date(account.locked_until) > now) return 'locked'
  if (account.must_change_password) return 'must_change'
  return 'active'
}

/** Roles a los que se puede pasar la cuenta, sin contar el que ya tiene (vacío: no se puede cambiar). */
export const otherRoles = (account: AdminAccount): Role[] => account.assignable_roles.filter((r) => r !== account.role)
