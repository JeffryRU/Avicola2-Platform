import { z } from 'zod'

export const sellerSchema = z.object({
  username: z.string(),
  name: z.string(),
  zone: z.string().nullable(),
})
export type Seller = z.infer<typeof sellerSchema>

export const sessionSchema = z.object({ token: z.string().min(1), seller: sellerSchema })
export type Session = z.infer<typeof sessionSchema>

/** Formulario de inicio de sesión. */
export const credentialsSchema = z.object({
  username: z.string().trim().min(1, 'Ingresa tu usuario.').max(50, 'Usuario demasiado largo.'),
  password: z.string().min(1, 'Ingresa tu contraseña.').max(200),
  remember: z.boolean(),
})
export type Credentials = z.infer<typeof credentialsSchema>
