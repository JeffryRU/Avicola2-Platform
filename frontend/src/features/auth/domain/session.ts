import { z } from 'zod'
import { PERMISSIONS, ROLE_LABEL, ROLES } from '@/features/auth/types/roles'

export const roleSchema = z.enum(ROLES)
export type Role = z.infer<typeof roleSchema>

export const permissionSchema = z.enum(PERMISSIONS)
export type Permission = z.infer<typeof permissionSchema>

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
export const sessionSchema = z.object({
  seller: sellerSchema,
  must_change_password: z.boolean(),
  // Resueltos por el backend. Un perfil guardado antes de existir llega sin ellos: se refrescan
  // con /auth/me al abrir la app. Un permiso desconocido (de una versión más nueva) se ignora.
  permissions: z
    .array(z.string())
    .default([])
    .transform((list) => list.filter((p): p is Permission => permissionSchema.safeParse(p).success)),
  manageable_roles: z
    .array(z.string())
    .default([])
    .transform((list) => list.filter((r): r is Role => roleSchema.safeParse(r).success)),
})
export type Session = z.infer<typeof sessionSchema>

/** Vista de supervisión (inicio del equipo, Usuarios, dashboards de todos): todo rol que no es vendedor. */
export const isSupervisor = (seller: Seller) => seller.role !== 'seller'

/** ¿La sesión tiene este permiso? (lo decide el backend, no el rol). */
export const can = (session: Session, permission: Permission) => session.permissions.includes(permission)

/**
 * ¿Ve la app como supervisión (inicio del equipo, dashboards de todos)? Por permiso, no por rol:
 * un rol nuevo no hereda esta vista por no ser vendedor. Un perfil guardado antes de existir
 * los permisos llega sin ellos: hasta que /auth/me lo refresca, se usa el rol.
 */
export const hasTeamView = (session: Session) =>
  session.permissions.length ? can(session, 'view_team') : isSupervisor(session.seller)

/** "Supervisor general", "Supervisor" o "Vendedor, Trujillo" (debajo del nombre). */
export const roleLabel = (seller: Seller) =>
  seller.role === 'seller' && seller.zone ? `${ROLE_LABEL.seller}, ${seller.zone}` : ROLE_LABEL[seller.role]

/** Formulario "Configuración de perfil" (mismas reglas que el backend). */
export const profileSchema = z.object({
  name: z
    .string()
    .transform((v) => v.split(/\s+/).filter(Boolean).join(' '))
    .pipe(z.string().min(1, 'Ingresa tu nombre.').max(100, 'Como máximo 100 caracteres.')),
})

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
