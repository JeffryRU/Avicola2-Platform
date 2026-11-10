/** Rutas de la app (URL en español, como la interfaz). */
export const paths = {
  home: '/',
  register: '/registrar',
  registered: '/registrar/listo',
  mine: '/proyecciones',
  day: (date: string) => `/proyecciones/${date}`,
  teamDay: (date: string) => `/dashboards/dia/${date}`,
  dashSummary: '/dashboards/resumen',
  dashVersus: '/dashboards/vs-venta',
  dashStatus: '/dashboards/estado',
  products: '/productos',
  notifications: '/notificaciones',
  profile: '/perfil',
  profileSettings: '/perfil/datos',
  connection: '/perfil/conexion',
  password: '/perfil/contrasena',
  accounts: '/usuarios',
  unlocks: '/habilitaciones',
  history: '/historial',
  stock: '/stock',
} as const

export const DASHBOARDS = [
  { to: paths.dashSummary, label: 'Resumen semanal', short: 'Resumen' },
  { to: paths.dashVersus, label: 'Proyección vs venta real', short: 'Vs. venta' },
  { to: paths.dashStatus, label: 'Estado por día', short: 'Estado' },
] as const

/** Pantallas de flujo: en celular ocultan la barra inferior. */
export const isFlowPath = (pathname: string) =>
  pathname.startsWith(paths.register) || /^\/proyecciones\/\d{4}-/.test(pathname)
