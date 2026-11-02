/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Base de la API (por defecto /api, servida por el mismo FastAPI). */
  readonly VITE_API_BASE?: string
}
