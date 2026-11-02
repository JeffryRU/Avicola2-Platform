import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// El backend (FastAPI) sirve el build; en desarrollo, Vite reenvía /api al backend.
const backend = process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['mascot.png', 'favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Noraves · Planificación de Demanda',
        short_name: 'Noraves',
        description: 'Proyección diaria de demanda por producto para vendedores.',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0B2C61',
        background_color: '#F0F5FC',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/docs/, /^\/ingest\//],
        // Catálogo y vendedores: se pueden leer sin conexión con la última copia.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === '/api/catalog' || url.pathname === '/api/sellers',
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
