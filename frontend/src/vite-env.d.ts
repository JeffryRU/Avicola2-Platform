/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Versión del build (package.json + fecha), la envían los reportes de errores. */
declare const __APP_VERSION__: string
/** Rama y commit desplegados (para saber qué versión es este despliegue). */
declare const __APP_BRANCH__: string
declare const __APP_COMMIT__: string

interface ImportMetaEnv {
  /** Base de la API (por defecto /api, servida por el mismo FastAPI). */
  readonly VITE_API_BASE?: string
  /** "true" muestra los usuarios de prueba en el login (por defecto solo en `pnpm dev`). */
  readonly VITE_SHOW_DEMO_USERS?: string
}
