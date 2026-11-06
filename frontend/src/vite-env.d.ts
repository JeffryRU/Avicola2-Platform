/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Versión del build (package.json + fecha), la envían los reportes de errores. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Base de la API (por defecto /api, servida por el mismo FastAPI). */
  readonly VITE_API_BASE?: string
  /** "true" muestra los usuarios de prueba en el login (por defecto solo en `pnpm dev`). */
  readonly VITE_SHOW_DEMO_USERS?: string
  /** APK de la app de Android. Por defecto, la última Release de GitHub; vacío la oculta. */
  readonly VITE_ANDROID_APK_URL?: string
}
