import { z } from 'zod'
import { PERMISSIONS, ROLE_LABEL, ROLES } from '@/shared/types/roles'

// Quién usa la app y qué puede hacer: lo usan casi todas las features, por eso vive aquí y no en
// `features/auth` (que se queda con el inicio de sesión, la contraseña y el ciclo de la sesión).

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

/** Solo los vendedores de una lista (sin supervisión): los que proyectan. */
export const sellersOnly = (list: Seller[]) => list.filter((s) => !isSupervisor(s))

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
