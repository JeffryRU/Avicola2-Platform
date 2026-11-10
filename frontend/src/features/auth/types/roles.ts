/**
 * Roles que conoce la app. Quién puede hacer qué NO se decide aquí: lo resuelve el backend
 * (domain/permissions.py) y llega en la sesión (`permissions`, `manageable_roles`) y en cada
 * cuenta de Usuarios (`can_manage`, `assignable_roles`).
 */
export const ROLES = ['seller', 'dispatch_chief', 'supervisor', 'general_supervisor'] as const

/** Nombre en pantalla de cada rol: la única fuente de estos textos. */
export const ROLE_LABEL = {
  seller: 'Vendedor',
  dispatch_chief: 'Jefe de despacho',
  supervisor: 'Supervisor',
  general_supervisor: 'Supervisor general',
} as const satisfies Record<(typeof ROLES)[number], string>

/** Nombre en pantalla de cualquier rol (uno desconocido se muestra tal cual). */
export const roleName = (role: string): string =>
  role in ROLE_LABEL ? ROLE_LABEL[role as keyof typeof ROLE_LABEL] : role

/** Qué hace cada rol (ayuda del selector de rol). */
export const ROLE_HINT = {
  seller: 'Registra sus proyecciones y ve solo lo suyo.',
  dispatch_chief: 'Registra el stock de despacho de cada día. No proyecta ni ve al equipo.',
  supervisor: 'Ve a todo el equipo y gestiona las cuentas de los vendedores.',
  general_supervisor: 'Como el supervisor, y además gestiona a los supervisores y cambia roles.',
} as const satisfies Record<(typeof ROLES)[number], string>

/** Permisos que envía el backend (los mismos nombres que domain/permissions.py). */
export const PERMISSIONS = [
  'view_team',
  'manage_editing',
  'manage_accounts',
  'change_roles',
  'view_stock',
  'manage_stock',
] as const
