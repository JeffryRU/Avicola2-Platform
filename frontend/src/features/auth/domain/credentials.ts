import { z } from 'zod'

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
