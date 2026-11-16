import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { AppShell } from '@/app/AppShell'
import type { Container } from '@/app/container'
import { ContainerContext, useContainer } from '@/app/di'
import { createQueryClient } from '@/app/query-client'
import { paths, routePatterns } from '@/app/routes'
import { can, hasTeamView, type Session } from '@/shared/domain/session'
import { LoginPage } from '@/features/auth/ui/pages/LoginPage'
import { useRealtime } from '@/features/notifications'
import { useSession, useVerifySession } from '@/features/auth'
import { VersionProvider } from '@/features/versions'
import { useFlushQueue } from '@/features/projections'
import { BrandProvider } from '@/shared/ui/components/brand'
import { BRAND_IDS, DEFAULT_BRAND, type BrandId } from '@/shared/types/brands'
import { ErrorBoundary } from '@/shared/ui/components/error-boundary'
import { Splash } from '@/shared/ui/components/feedback'
import { Toaster } from '@/shared/ui/components/shadcn/sonner'

/** Pantalla cargada a demanda: el celular descarga solo lo que abre. */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

const HistoryPage = page(() => import('@/features/history/ui/pages/HistoryPage'), 'HistoryPage')
const UnlocksPage = page(() => import('@/features/editing/ui/pages/UnlocksPage'), 'UnlocksPage')
const AccountsPage = page(() => import('@/features/accounts/ui/pages/AccountsPage'), 'AccountsPage')
const ChangePasswordPage = page(() => import('@/features/auth/ui/pages/ChangePasswordPage'), 'ChangePasswordPage')
const ConnectionPage = page(() => import('@/features/connection/ui/pages/ConnectionPage'), 'ConnectionPage')
const DashboardStatusPage = page(
  () => import('@/features/dashboards/ui/pages/DashboardStatusPage'),
  'DashboardStatusPage',
)
const DashboardSummaryPage = page(
  () => import('@/features/dashboards/ui/pages/DashboardSummaryPage'),
  'DashboardSummaryPage',
)
const DashboardVersusPage = page(
  () => import('@/features/dashboards/ui/pages/DashboardVersusPage'),
  'DashboardVersusPage',
)
const SupervisorHomePage = page(() => import('@/features/home/ui/pages/SupervisorHomePage'), 'SupervisorHomePage')
const ProfileSettingsPage = page(() => import('@/features/profile/ui/pages/ProfileSettingsPage'), 'ProfileSettingsPage')
const TeamDayPage = page(() => import('@/features/dashboards/ui/pages/TeamDayPage'), 'TeamDayPage')
const DayDetailPage = page(() => import('@/features/projections/ui/pages/DayDetailPage'), 'DayDetailPage')
const HomePage = page(() => import('@/features/home/ui/pages/HomePage'), 'HomePage')
const MyProjectionsPage = page(() => import('@/features/projections/ui/pages/MyProjectionsPage'), 'MyProjectionsPage')
const NewProjectionPage = page(() => import('@/features/projections/ui/pages/NewProjectionPage'), 'NewProjectionPage')
const NotificationsPage = page(() => import('@/features/notifications/ui/pages/NotificationsPage'), 'NotificationsPage')
const ProductsPage = page(() => import('@/features/catalog/ui/pages/ProductsPage'), 'ProductsPage')
const ProfilePage = page(() => import('@/features/profile/ui/pages/ProfilePage'), 'ProfilePage')
const ForecastPage = page(() => import('@/features/production/ui/pages/ForecastPage'), 'ForecastPage')
const MyRequestsPage = page(() => import('@/features/editing/ui/pages/MyRequestsPage'), 'MyRequestsPage')
const ProductionPage = page(() => import('@/features/production/ui/pages/ProductionPage'), 'ProductionPage')
const SacaPage = page(() => import('@/features/saca/ui/pages/SacaPage'), 'SacaPage')
const StockPage = page(() => import('@/features/stock/ui/pages/StockPage'), 'StockPage')
const SuccessPage = page(() => import('@/features/projections/ui/pages/SuccessPage'), 'SuccessPage')

/** Espera antes del primer reintento de la cola offline (deja cargar la app). */
const FIRST_SYNC_DELAY_MS = 2500
/** Pantalla de bienvenida: al abrir la app, tras iniciar sesión y lo que dura su animación. */
const SPLASH_MS = 2350
const LOGIN_SPLASH_MS = 1550
const SPLASH_ANIMATION_S = 2.2

/** Reintenta la cola offline al volver la conexión y al iniciar sesión. */
function useOutboxSync() {
  const session = useSession()
  // mutateAsync es estable entre renders; al terminar ya refrescó las proyecciones.
  const { mutateAsync: flushQueue } = useFlushQueue()
  useEffect(() => {
    if (!session) return
    const seller = session.seller.username
    const flush = async (silent: boolean) => {
      const r = await flushQueue(seller)
      r.rejected.forEach((m) => toast.error(`Un envío fue rechazado: ${m}`))
      if (!silent && r.sent) toast.success(`${r.sent} ${r.sent === 1 ? 'envío sincronizado' : 'envíos sincronizados'}`)
    }
    const t = setTimeout(() => void flush(true), FIRST_SYNC_DELAY_MS)
    const online = () => void flush(false)
    addEventListener('online', online)
    return () => {
      clearTimeout(t)
      removeEventListener('online', online)
    }
  }, [flushQueue, session])
}

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

/** Rutas de la cuenta, iguales para todos los roles, y la que devuelve al inicio. */
const accountRoutes = (
  <>
    <Route path={paths.notifications} element={<NotificationsPage />} />
    <Route path={paths.profile} element={<ProfilePage />} />
    <Route path={paths.profileSettings} element={<ProfileSettingsPage />} />
    <Route path={paths.password} element={<ChangePasswordPage />} />
    <Route path={paths.connection} element={<ConnectionPage />} />
    <Route path="*" element={<Navigate to={paths.home} replace />} />
  </>
)

/** Rutas dentro de la estructura (menú y barra); cada pantalla se descarga al abrirla. */
function ShellRoutes({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route element={<AppShell />}>{children}</Route>
      </Routes>
    </Suspense>
  )
}

/** Supervisión: inicio del equipo, dashboards de todos y lo que permitan sus permisos. */
function TeamRoutes({ session }: { session: Session }) {
  return (
    <ShellRoutes>
      <Route index element={<SupervisorHomePage />} />
      {can(session, 'manage_accounts') && <Route path={paths.accounts} element={<AccountsPage />} />}
      {can(session, 'manage_editing') && <Route path={paths.unlocks} element={<UnlocksPage />} />}
      {can(session, 'view_stock') && <Route path={paths.stock} element={<StockPage />} />}
      {can(session, 'view_saca') && <Route path={paths.saca} element={<SacaPage />} />}
      {can(session, 'view_production') && <Route path={paths.production} element={<ProductionPage />} />}
      {can(session, 'view_production') && <Route path={paths.forecast} element={<ForecastPage />} />}
      <Route path={paths.register} element={<NewProjectionPage />} />
      <Route path={paths.history} element={<HistoryPage />} />
      <Route path={paths.dashSummary} element={<DashboardSummaryPage />} />
      <Route path={paths.dashVersus} element={<DashboardVersusPage />} />
      <Route path={paths.dashStatus} element={<DashboardStatusPage />} />
      <Route path={routePatterns.teamDay} element={<TeamDayPage />} />
      <Route path={paths.products} element={<ProductsPage />} />
      {accountRoutes}
    </ShellRoutes>
  )
}

/** Jefe de despacho: su inicio es el stock; no proyecta ni ve dashboards. */
function DispatchRoutes({ session }: { session: Session }) {
  return (
    <ShellRoutes>
      <Route index element={<StockPage />} />
      {can(session, 'view_production') && <Route path={paths.production} element={<ProductionPage />} />}
      {can(session, 'view_production') && <Route path={paths.forecast} element={<ForecastPage />} />}
      {accountRoutes}
    </ShellRoutes>
  )
}

/** Vendedor: registra y sigue sus proyecciones. */
function SellerRoutes() {
  return (
    <ShellRoutes>
      <Route index element={<HomePage />} />
      <Route path={paths.register} element={<NewProjectionPage />} />
      <Route path={paths.registered} element={<SuccessPage />} />
      <Route path={paths.mine} element={<MyProjectionsPage />} />
      <Route path={paths.requests} element={<MyRequestsPage />} />
      <Route path={paths.history} element={<HistoryPage />} />
      <Route path={routePatterns.day} element={<DayDetailPage />} />
      <Route path={paths.dashSummary} element={<DashboardSummaryPage />} />
      <Route path={paths.dashVersus} element={<DashboardVersusPage />} />
      <Route path={paths.dashStatus} element={<DashboardStatusPage />} />
      <Route path={paths.products} element={<ProductsPage />} />
      {accountRoutes}
    </ShellRoutes>
  )
}

function Routed() {
  const session = useSession()
  const [splash, setSplash] = useState(true)
  useSessionLifecycle()
  useOutboxSync()
  useRealtime()
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), SPLASH_MS)
    return () => clearTimeout(t)
  }, [])
  const showSplash = () => {
    setSplash(true)
    setTimeout(() => setSplash(false), LOGIN_SPLASH_MS)
  }
  return (
    <VersionProvider>
      <Splash visible={splash} durationS={SPLASH_ANIMATION_S} />
      {!session ? (
        <LoginPage onLoggedIn={showSplash} />
      ) : hasTeamView(session) ? (
        <TeamRoutes session={session} />
      ) : can(session, 'view_stock') ? (
        <DispatchRoutes session={session} />
      ) : (
        <SellerRoutes />
      )}
    </VersionProvider>
  )
}

const brandSchema = z.enum(BRAND_IDS)
/** Marca elegida en este equipo (KeyValueStore). */
const BRAND_KEY = 'nv_brand'

export function App({ container }: { container: Container }) {
  // Uno por app (useState lo crea una vez): sus valores por defecto están en query-client.ts.
  const [queryClient] = useState(() => createQueryClient(container.errors))
  const persistBrand = useCallback((b: BrandId) => container.preferences.set(BRAND_KEY, b), [container])
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
          </BrandProvider>
        </QueryClientProvider>
      </ContainerContext>
    </ErrorBoundary>
  )
}
