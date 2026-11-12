/**
 * Única fuente de las claves de TanStack Query ("query key factory"). Cada módulo tiene `all`
 * (su prefijo: invalidarlo refresca todas sus consultas) y funciones para cada consulta.
 * Ninguna pantalla escribe una clave a mano: así se ve qué invalida qué.
 *
 * Mapa con los endpoints (ver shared/infrastructure/api/endpoints.ts):
 * - auth.session          → GET /auth/me
 * - accounts.all          → GET /admin/accounts
 * - catalog.all           → GET /catalog
 * - sellers.all           → GET /sellers
 * - status.all            → GET /status
 * - projections.range     → GET /projections + GET /sales (un mismo rango de fechas)
 * - suggestions.get       → GET /suggestions
 * - history.list          → GET /projections/history
 * - saca.plan             → GET /saca
 * - stock.range/options   → GET /stock, GET /stock/options
 * - production.range      → GET /production; production.forecast → GET /production/forecast
 * - editing.window        → GET /editing; editing.unlocks → GET /editing/unlocks
 * - notifications.all     → GET /notifications
 */
export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    /** Confirmación de la cookie con el servidor, por usuario. */
    session: (username: string) => ['auth', 'session', username] as const,
  },

  accounts: {
    all: ['admin', 'accounts'] as const,
  },

  catalog: {
    all: ['catalog'] as const,
  },

  sellers: {
    all: ['sellers'] as const,
  },

  status: {
    all: ['status'] as const,
  },

  projections: {
    /** Proyecciones y ventas de todos los rangos (dashboards, inicio, mis proyecciones). */
    all: ['projections'] as const,
    range: (from: string, to: string) => ['projections', from, to] as const,
  },

  suggestions: {
    all: ['suggestions'] as const,
    get: (category: string, start: string, days: number, seller?: string) =>
      ['suggestions', category, start, days, seller ?? null] as const,
  },

  history: {
    all: ['history'] as const,
    list: (from: string, to: string, seller?: string) => ['history', from, to, seller ?? null] as const,
  },

  saca: {
    all: ['saca'] as const,
    plan: (day: string) => ['saca', day] as const,
  },

  stock: {
    /** Incluye las opciones: registrar stock refresca la lista y las opciones. */
    all: ['stock'] as const,
    range: (from: string, to: string) => ['stock', from, to] as const,
    options: ['stock', 'options'] as const,
  },

  production: {
    /** Incluye la estimación de llegada: registrar producción refresca ambas. */
    all: ['production'] as const,
    range: (from: string, to: string) => ['production', from, to] as const,
    forecast: (weights: readonly number[]) => ['production', 'forecast', ...weights] as const,
  },

  editing: {
    all: ['editing'] as const,
    window: ['editing', 'window'] as const,
    unlocks: ['editing', 'unlocks'] as const,
  },

  notifications: {
    all: ['notifications'] as const,
  },
} as const
