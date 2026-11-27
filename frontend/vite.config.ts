import { execSync } from 'node:child_process'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// El backend (FastAPI) sirve el build; en desarrollo, Vite reenvía /api al backend.
const backend = process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8000'

const version = `${process.env.npm_package_version ?? '0.0.0'}+${new Date().toISOString().slice(0, 16)}`

/** Rama y commit de este build: en Vercel vienen en el entorno; en local, de git. */
function git(args: string, fallback: string) {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return fallback
  }
}
const branch = process.env.VERCEL_GIT_COMMIT_REF ?? git('rev-parse --abbrev-ref HEAD', '')
const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? git('rev-parse HEAD', '')
/** Distinto en cada build: la app lo compara con /version.json para saber si hay una versión nueva. */
const build = `${commit.slice(0, 12) || 'local'}-${Date.now().toString(36)}`

/** Escribe /version.json con el identificador del build (el servidor lo sirve sin caché). */
const versionFile = (): Plugin => ({
  name: 'aviplanner-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build, version, commit }) })
  },
})

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BRANCH__: JSON.stringify(branch),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILD__: JSON.stringify(build),
  },
  plugins: [
    react(),
    tailwindcss(),
    versionFile(),
    VitePWA({
      registerType: 'autoUpdate',
      // Lo registra app/update-watcher.tsx: avisa antes de recargar y busca versiones nuevas.
      injectRegister: false,
      includeAssets: ['mascot.png', 'favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'AviPlanner · Planificación de Demanda',
        short_name: 'AviPlanner',
        description: 'Proyección diaria de demanda por producto para vendedores.',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0B2C61',
        background_color: '#F6F6F3',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Fuentes propias incluidas: la app se ve igual sin conexión.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/docs/, /^\/ingest\//],
        // Catálogo y vendedores: se pueden leer sin conexión con la última copia.
        runtimeCaching: [
          {
            // Solo el catálogo (igual para todos). Se borra al cerrar sesión (shared/infrastructure/cached-data.ts).
            urlPattern: ({ url }) => url.pathname === '/api/catalog',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'api-master-data' },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { proxy: { '/api': backend } },
})
