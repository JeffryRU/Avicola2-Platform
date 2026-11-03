import { z } from 'zod'
import { ROLE_LABEL } from '@/features/auth/types/roles'

export const roleSchema = z.enum(['seller', 'supervisor'])
export type Role = z.infer<typeof roleSchema>

export const sellerSchema = z.object({
  username: z.string(),
  name: z.string(),
  zone: z.string().nullable(),
  role: roleSchema,
})
export type Seller = z.infer<typeof sellerSchema>

/**
 * Lo que la app sabe de la sesión. El token NO está aquí: viaja en una cookie HttpOnly que el
 * JavaScript de la página no puede leer. Esto es solo el perfil para pintar la interfaz.
 */
export const sessionSchema = z.object({ seller: sellerSchema, must_change_password: z.boolean() })
export type Session = z.infer<typeof sessionSchema>

export const isSupervisor = (seller: Seller) => seller.role === 'supervisor'

/** "Supervisor" o "Vendedor, Trujillo" (debajo del nombre). */
export const roleLabel = (seller: Seller) =>
  isSupervisor(seller)
    ? ROLE_LABEL.supervisor
    : seller.zone
      ? `${ROLE_LABEL.seller}, ${seller.zone}`
      : ROLE_LABEL.seller

/** Formulario de inicio de sesión. */
export const credentialsSchema = z.object({
  username: z.string().trim().min(1, 'Ingresa tu usuario.').max(50, 'Usuario demasiado largo.'),
  password: z.string().min(1, 'Ingresa tu contraseña.').max(200),
  remember: z.boolean(),
})
export type Credentials = z.infer<typeof credentialsSchema>

/** Misma política que el backend (domain/accounts.py): se valida antes de enviar. */
export const newPasswordSchema = (username: string) =>
  z
    .object({
      current: z.string().min(1, 'Ingresa tu contraseña actual.').max(200),
      next: z
        .string()
        .min(8, 'Debe tener al menos 8 caracteres.')
        .max(128, 'Debe tener como máximo 128 caracteres.')
        .regex(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/, 'Debe incluir letras.')
        .regex(/\d/, 'Debe incluir números.')
        .refine((v) => !v.toLowerCase().includes(username.toLowerCase()), 'No puede contener tu usuario.'),
      confirm: z.string(),
    })
    .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden.' })
    .refine((v) => v.next !== v.current, { path: ['next'], message: 'Debe ser distinta de la actual.' })
export type NewPassword = z.infer<ReturnType<typeof newPasswordSchema>>
