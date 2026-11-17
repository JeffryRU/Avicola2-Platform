/** Bases de las rutas con parámetros: las comparten `paths` y `routePatterns`. */
const MINE = '/proyecciones'
const DASHBOARDS_BASE = '/dashboards'
const TEAM_DAY = `${DASHBOARDS_BASE}/dia`

/** Rutas de la app (URL en español, como la interfaz). Única fuente: nada escribe una URL a mano. */
export const paths = {
  home: '/',
  register: '/registrar',
  registered: '/registrar/listo',
  mine: MINE,
  day: (date: string) => `${MINE}/${date}`,
  teamDay: (date: string) => `${TEAM_DAY}/${date}`,
  dashboards: DASHBOARDS_BASE,
  dashSummary: `${DASHBOARDS_BASE}/resumen`,
  dashVersus: `${DASHBOARDS_BASE}/vs-venta`,
  dashStatus: `${DASHBOARDS_BASE}/estado`,
  products: '/productos',
  notifications: '/notificaciones',
  profile: '/perfil',
  profileSettings: '/perfil/datos',
  appearance: '/perfil/apariencia',
  accessibility: '/perfil/accesibilidad',
  connection: '/perfil/conexion',
  password: '/perfil/contrasena',
  accounts: '/usuarios',
  unlocks: '/habilitaciones',
  requests: '/solicitudes',
  history: '/historial',
  stock: '/stock',
  saca: '/saca',
  production: '/produccion',
  forecast: '/pronostico',
} as const

/** Patrones de las rutas con parámetros, para declararlas en el router. */
export const routePatterns = {
  day: `${MINE}/:date`,
  teamDay: `${TEAM_DAY}/:date`,
} as const

export const DASHBOARDS = [
  { to: paths.dashSummary, label: 'Resumen semanal', short: 'Resumen' },
  { to: paths.dashVersus, label: 'Proyección vs venta real', short: 'Vs. venta' },
  { to: paths.dashStatus, label: 'Estado por día', short: 'Estado' },
] as const

/** Detalle de un día propio: /proyecciones/AAAA-… */
const DAY_DETAIL = new RegExp(`^${MINE}/\\d{4}-`)

/** Pantallas de flujo: en celular ocultan la barra inferior. */
export const isFlowPath = (pathname: string) => pathname.startsWith(paths.register) || DAY_DETAIL.test(pathname)
