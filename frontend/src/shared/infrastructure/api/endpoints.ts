/**
 * Índice único de los endpoints del backend que usa el frontend: ninguna otra parte del código
 * escribe una ruta de la API. Las rutas son relativas a la base (`VITE_API_BASE`, por defecto
 * `/api`); los parámetros de ruta pasan siempre por `encodeURIComponent`.
 *
 * Cada entrada indica el método y qué devuelve, para leerlo como un índice de la API.
 * No están aquí `/ingest/*` (los llama n8n con token de servicio, no el navegador) ni `/health`.
 */

/** Un segmento de ruta seguro (usuario, fecha, id...). */
const seg = (value: string | number) => encodeURIComponent(String(value))

export const endpoints = {
  auth: {
    /** POST {username, password, remember} → perfil de la sesión (el token llega en cookie HttpOnly). */
    login: '/auth/login',
    /** POST {} → 204: borra la cookie de sesión. */
    logout: '/auth/logout',
    /** GET → perfil de la sesión actual (confirma que la cookie sigue vigente). */
    me: '/auth/me',
    /** PATCH {name} → perfil actualizado. */
    profile: '/auth/profile',
    /** POST {current_password, new_password, remember} → perfil (cierra las otras sesiones). */
    password: '/auth/password',
  },

  accounts: {
    /** GET → cuentas (supervisor). POST {username, name, role, zone} → credenciales temporales. */
    list: '/admin/accounts',
    /** PATCH {active} → cuenta actualizada (activar o desactivar). */
    account: (username: string) => `/admin/accounts/${seg(username)}`,
    /** POST {} → credenciales temporales nuevas. */
    resetPassword: (username: string) => `/admin/accounts/${seg(username)}/reset-password`,
    /** PUT {role} → cuenta con el rol nuevo. */
    role: (username: string) => `/admin/accounts/${seg(username)}/role`,
  },

  catalog: {
    /** GET → productos del catálogo (lo cachea además el service worker). */
    list: '/catalog',
  },

  sellers: {
    /** GET → vendedores y supervisores del equipo. */
    list: '/sellers',
  },

  projections: {
    /** GET ?date_from&date_to&seller → proyecciones. POST {submission_id, category, days, seller?} → resultado. */
    list: '/projections',
    /** GET ?date_from&date_to&seller → quién creó o modificó cada proyección. */
    history: '/projections/history',
  },

  sales: {
    /** GET ?date_from&date_to&seller → unidades vendidas por día. */
    list: '/sales',
  },

  suggestions: {
    /** GET ?category&start&days&on_behalf → proyección sugerida con el historial. */
    get: '/suggestions',
  },

  saca: {
    /** GET ?date → saca calculada ese día: stock − pedidos de mañana + proyección de pasado mañana + plus. */
    plan: '/saca',
    /** PUT {plus} → plus (aves extra) por tipo guardado. */
    plus: '/saca/plus',
  },

  stock: {
    /** GET ?date_from&date_to → stock por día, lote, ubicación y calidad. */
    list: '/stock',
    /** GET → ubicaciones, lotes y calidades disponibles. */
    options: '/stock/options',
    /** PUT {location, lines} → stock registrado del día. */
    day: (day: string) => `/stock/${seg(day)}`,
  },

  production: {
    /** GET ?date_from&date_to → producción por día. */
    list: '/production',
    /** GET ?weight=…&weight=… → estimación de llegada por tipo. */
    forecast: '/production/forecast',
    /** PUT {lines, weights} → producción registrada del día. */
    day: (day: string) => `/production/${seg(day)}`,
  },

  editing: {
    /** GET → días que se pueden registrar y hora de corte. */
    window: '/editing',
    /** GET → solicitudes de apertura. POST {date, reason} → solicitud creada. */
    unlocks: '/editing/unlocks',
    /** POST {action} → solicitud aprobada o rechazada (supervisor). */
    decide: (id: number) => `/admin/editing/unlocks/${seg(id)}`,
    /** PUT {cutoff_time, days_before, enabled} → hora de corte guardada. */
    cutoff: '/admin/editing/cutoff',
    /** POST {dates} → aperturas concedidas a un vendedor. */
    grant: (username: string) => `/admin/editing/sellers/${seg(username)}/grant`,
    /** POST {} → aperturas revocadas de un vendedor. */
    revoke: (username: string) => `/admin/editing/sellers/${seg(username)}/revoke`,
  },

  notifications: {
    /** GET → notificaciones y cantidad sin leer. */
    list: '/notifications',
    /** POST {ids?} → {updated}: marca como leídas (todas si no hay ids). */
    read: '/notifications/read',
  },

  events: {
    /** GET (SSE, EventSource) → eventos en tiempo real: notificaciones, cambios y sesión cerrada. */
    stream: '/events',
  },

  status: {
    /** GET → estado de la base de datos (motor, nombre, tablas). */
    db: '/status',
  },

  logs: {
    /** POST {entries} → 204: errores del navegador (público; quedan en logs/frontend.log). */
    client: '/client-logs',
  },
} as const

/** URL completa (para fetch, sendBeacon o EventSource, que no pasan por el cliente HTTP). */
export const apiUrl = (baseUrl: string, path: string) => `${baseUrl.replace(/\/$/, '')}${path}`
