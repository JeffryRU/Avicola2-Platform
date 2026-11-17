import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import type { Container } from '@/app/container'
import { ContainerContext, useContainer } from '@/app/di'
import { createQueryClient } from '@/app/query-client'
import { LoginPage } from '@/features/auth/ui/pages/LoginPage'
import { useSession, useVerifySession } from '@/features/auth'
import { VersionProvider } from '@/features/versions'
import { TopControls } from '@/app/top-controls'
import { BrandProvider } from '@/shared/ui/components/brand'
import { AppearanceProvider } from '@/shared/ui/components/appearance'
import { AccessibilityProvider } from '@/shared/ui/components/accessibility'
import { A11Y_KEY, sanitizeA11y, type A11yPreference } from '@/shared/domain/accessibility'
import {
  CONTRAST_KEY,
  ACCENT_IDS,
  ACCENT_KEY,
  CONTRAST_PREFERENCES,
  DEFAULT_APPEARANCE,
  THEME_KEY,
  THEME_PREFERENCES,
  type AppearancePreference,
} from '@/shared/domain/appearance'
import { BRAND_IDS, DEFAULT_BRAND, type BrandId } from '@/shared/types/brands'
import { ErrorBoundary } from '@/shared/ui/components/error-boundary'
import { Splash } from '@/shared/ui/components/feedback'
import { Toaster } from '@/shared/ui/components/shadcn/sonner'

/** La app con sesión se descarga aparte: el login no la necesita para pintarse. */
const loadAuthenticatedApp = () => import('@/app/AuthenticatedApp')
const AuthenticatedApp = lazy(() => loadAuthenticatedApp().then((m) => ({ default: m.AuthenticatedApp })))

/**
 * Pantalla de bienvenida: al abrir la app y tras iniciar sesión. Dura lo justo para que se vea la
 * entrada de la mascota y el nombre; tapa la descarga de la app con sesión.
 */
const SPLASH_MS = 1300
const LOGIN_SPLASH_MS = 1000

/** Confirma la cookie al abrir la app y, al cerrar sesión, olvida los datos del usuario anterior. */
function useSessionLifecycle() {
  const session = useSession()
  const client = useQueryClient()
  const user = session?.seller.username
  const { auth } = useContainer()
  useVerifySession(user)
  useEffect(() => {
    // Al volver a la pestaña se confirma la sesión: en otra pestaña pudieron entrar con otra cuenta.
    const check = () => {
      if (document.visibilityState === 'visible') void auth.verify()
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [auth])
  const previous = useRef(user)
  useEffect(() => {
    // Otra cuenta (o ninguna): los datos guardados eran de la anterior.
    if (previous.current !== user) client.clear()
    if (previous.current && user && previous.current !== user) {
      toast.info(`En otra pestaña se entró como ${user}. Esta pestaña ahora usa esa cuenta.`)
    }
    previous.current = user
  }, [user, client])
}

function Routed() {
  const session = useSession()
  const [splash, setSplash] = useState(true)
  useSessionLifecycle()
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), SPLASH_MS)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    // Sin sesión, se adelanta la descarga de la app mientras la persona escribe su clave.
    if (session) return
    const prefetch = () => void loadAuthenticatedApp()
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(prefetch)
    else window.setTimeout(prefetch, 1)
  }, [session])
  const showSplash = () => {
    setSplash(true)
    setTimeout(() => setSplash(false), LOGIN_SPLASH_MS)
  }
  return (
    <VersionProvider>
      <Splash visible={splash} />
      {!session ? (
        <LoginPage onLoggedIn={showSplash} corner={<TopControls />} />
      ) : (
        <Suspense fallback={null}>
          <AuthenticatedApp session={session} />
        </Suspense>
      )}
    </VersionProvider>
  )
}

const brandSchema = z.enum(BRAND_IDS)
/** Marca elegida en este equipo (KeyValueStore). La lee también public/appearance-boot.js. */
const BRAND_KEY = 'nv_brand'
const themeSchema = z.enum(THEME_PREFERENCES)
const contrastSchema = z.enum(CONTRAST_PREFERENCES)
const accentSchema = z.enum(ACCENT_IDS)
/** Opciones de accesibilidad: lo que no se entienda vuelve a su valor normal. */
const a11ySchema = z.unknown().transform(sanitizeA11y)

export function App({ container }: { container: Container }) {
  // Uno por app (useState lo crea una vez): sus valores por defecto están en query-client.ts.
  const [queryClient] = useState(() => createQueryClient(container.errors))
  const persistBrand = useCallback((b: BrandId) => container.preferences.set(BRAND_KEY, b), [container])
  const persistAppearance = useCallback(
    (p: AppearancePreference) => {
      container.preferences.set(THEME_KEY, p.theme)
      container.preferences.set(CONTRAST_KEY, p.contrast)
      container.preferences.set(ACCENT_KEY, p.accent)
    },
    [container],
  )
  const [appearance] = useState<AppearancePreference>(() => ({
    theme: container.preferences.get(THEME_KEY, themeSchema) ?? DEFAULT_APPEARANCE.theme,
    contrast: container.preferences.get(CONTRAST_KEY, contrastSchema) ?? 'system',
    accent: container.preferences.get(ACCENT_KEY, accentSchema) ?? DEFAULT_APPEARANCE.accent,
  }))
  const persistA11y = useCallback((p: A11yPreference) => container.preferences.set(A11Y_KEY, p), [container])
  const [a11y] = useState(() => sanitizeA11y(container.preferences.get(A11Y_KEY, a11ySchema)))
  const reportCrash = useCallback(
    (error: unknown, componentStack: string) => {
      const crash = error instanceof Error ? error : new Error(String(error))
      crash.stack = `${crash.stack ?? crash.message}
Componentes:${componentStack}`
      container.errors.report(crash, 'react')
    },
    [container],
  )
  return (
    <ErrorBoundary onError={reportCrash}>
      <ContainerContext value={container}>
        <QueryClientProvider client={queryClient}>
          <BrandProvider
            initial={container.preferences.get(BRAND_KEY, brandSchema) ?? DEFAULT_BRAND}
            persist={persistBrand}
          >
            <AppearanceProvider initial={appearance} persist={persistAppearance}>
              <AccessibilityProvider initial={a11y} persist={persistA11y}>
                <BrowserRouter>
                  <Routed />
                </BrowserRouter>
                {/* Avisos arriba a la derecha; en el celular, arriba (respetando la muesca). */}
                <Toaster
                  position="top-right"
                  offset={{ top: 20, right: 20 }}
                  mobileOffset={{ top: 'calc(10px + env(safe-area-inset-top))', left: 12, right: 12 }}
                  closeButton
                  visibleToasts={4}
                />
              </AccessibilityProvider>
            </AppearanceProvider>
          </BrandProvider>
        </QueryClientProvider>
      </ContainerContext>
    </ErrorBoundary>
  )
}
