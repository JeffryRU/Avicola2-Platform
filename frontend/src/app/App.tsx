import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { AppShell } from '@/app/AppShell'
import type { Container } from '@/app/container'
import { ContainerProvider, useContainer } from '@/app/di'
import { paths } from '@/app/routes'
import { can, hasTeamView } from '@/features/auth/domain/session'
import { ForcedPasswordChange } from '@/features/auth/ui/ChangePasswordPage'
import { LoginPage } from '@/features/auth/ui/LoginPage'
import { useRealtime } from '@/features/notifications/ui/hooks'
import { useSession } from '@/features/auth/ui/use-session'
import { BrandProvider, type BrandId } from '@/shared/ui/components/brand'
import { ErrorBoundary } from '@/shared/ui/components/error-boundary'
import { Splash } from '@/shared/ui/components/feedback'
import { Toaster } from '@/shared/ui/components/shadcn/sonner'

/** Pantallas cargadas a demanda: el celular descarga solo lo que abre. */
const HistoryPage = lazy(() =>
  import('@/features/history/ui/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
)
const UnlocksPage = lazy(() =>
  import('@/features/editing/ui/pages/UnlocksPage').then((m) => ({ default: m.UnlocksPage })),
)
const AccountsPage = lazy(() =>
  import('@/features/accounts/ui/AccountsPage').then((m) => ({ default: m.AccountsPage })),
)
const ChangePasswordPage = lazy(() =>
  import('@/features/auth/ui/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })),
)
const ConnectionPage = lazy(() =>
  import('@/features/connection/ui/pages/ConnectionPage').then((m) => ({ default: m.ConnectionPage })),
)
const DashboardStatusPage = lazy(() =>
  import('@/features/dashboards/ui/pages/DashboardStatusPage').then((m) => ({ default: m.DashboardStatusPage })),
)
const DashboardSummaryPage = lazy(() =>
  import('@/features/dashboards/ui/pages/DashboardSummaryPage').then((m) => ({ default: m.DashboardSummaryPage })),
)
const DashboardVersusPage = lazy(() =>
  import('@/features/dashboards/ui/pages/DashboardVersusPage').then((m) => ({ default: m.DashboardVersusPage })),
)
const SupervisorHomePage = lazy(() =>
  import('@/features/home/ui/pages/SupervisorHomePage').then((m) => ({ default: m.SupervisorHomePage })),
)
const ProfileSettingsPage = lazy(() =>
  import('@/features/profile/ui/pages/ProfileSettingsPage').then((m) => ({ default: m.ProfileSettingsPage })),
)
const TeamDayPage = lazy(() =>
  import('@/features/dashboards/ui/pages/TeamDayPage').then((m) => ({ default: m.TeamDayPage })),
)
const DayDetailPage = lazy(() =>
  import('@/features/projections/ui/pages/DayDetailPage').then((m) => ({ default: m.DayDetailPage })),
)
const HomePage = lazy(() => import('@/features/home/ui/pages/HomePage').then((m) => ({ default: m.HomePage })))
const MyProjectionsPage = lazy(() =>
  import('@/features/projections/ui/pages/MyProjectionsPage').then((m) => ({ default: m.MyProjectionsPage })),
)
const NewProjectionPage = lazy(() =>
  import('@/features/projections/ui/pages/NewProjectionPage').then((m) => ({ default: m.NewProjectionPage })),
)
const NotificationsPage = lazy(() =>
  import('@/features/notifications/ui/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
const ProductsPage = lazy(() =>
  import('@/features/catalog/ui/pages/ProductsPage').then((m) => ({ default: m.ProductsPage })),
)
const ProfilePage = lazy(() =>
  import('@/features/profile/ui/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const ForecastPage = lazy(() =>
  import('@/features/production/ui/pages/ForecastPage').then((m) => ({ default: m.ForecastPage })),
)
const ProductionPage = lazy(() =>
  import('@/features/production/ui/pages/ProductionPage').then((m) => ({ default: m.ProductionPage })),
)
const SacaPage = lazy(() => import('@/features/saca/ui/pages/SacaPage').then((m) => ({ default: m.SacaPage })))
const StockPage = lazy(() => import('@/features/stock/ui/pages/StockPage').then((m) => ({ default: m.StockPage })))
const SuccessPage = lazy(() =>
  import('@/features/projections/ui/pages/SuccessPage').then((m) => ({ default: m.SuccessPage })),
)

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

/** Reintenta la cola offline al volver la conexión y al iniciar sesión. */
function useOutboxSync() {
  const { planning } = useContainer()
  const session = useSession()
  const client = useQueryClient()
  useEffect(() => {
    if (!session) return
    const seller = session.seller.username
    const flush = async (silent: boolean) => {
      const r = await planning.flush(seller)
      if (r.sent) void client.invalidateQueries({ queryKey: ['window'] })
      r.rejected.forEach((m) => toast.error(`Un envío fue rechazado: ${m}`))
      if (!silent && r.sent) toast.success(`${r.sent} ${r.sent === 1 ? 'envío sincronizado' : 'envíos sincronizados'}`)
    }
    const t = setTimeout(() => void flush(true), 2500)
    const online = () => void flush(false)
    addEventListener('online', online)
    return () => {
      clearTimeout(t)
      removeEventListener('online', online)
    }
  }, [planning, session, client])
}

/** Confirma la cookie al abrir la app y, al cerrar sesión, olvida los datos del usuario anterior. */
function useSessionLifecycle() {
  const { auth } = useContainer()
  const session = useSession()
  const client = useQueryClient()
  const user = session?.seller.username
  useEffect(() => {
    void auth.verify()
  }, [auth])
  useEffect(() => {
    if (!user) client.clear()
  }, [user, client])
}

function Routed() {
  const session = useSession()
  const [splash, setSplash] = useState(true)
  useSessionLifecycle()
  useOutboxSync()
  useRealtime()
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 2350)
    return () => clearTimeout(t)
  }, [])
  const showSplash = () => {
    setSplash(true)
    setTimeout(() => setSplash(false), 1550)
  }
  return (
    <>
      <Splash visible={splash} durationS={2.2} />
      {!session ? (
        <LoginPage onLoggedIn={showSplash} />
      ) : session.must_change_password ? (
        <ForcedPasswordChange />
      ) : hasTeamView(session) ? (
        <Suspense fallback={null}>
          <Routes>
            <Route element={<AppShell />}>
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
              <Route path="/dashboards/dia/:date" element={<TeamDayPage />} />
              <Route path={paths.products} element={<ProductsPage />} />
              <Route path={paths.notifications} element={<NotificationsPage />} />
              <Route path={paths.profile} element={<ProfilePage />} />
              <Route path={paths.profileSettings} element={<ProfileSettingsPage />} />
              <Route path={paths.password} element={<ChangePasswordPage />} />
              <Route path={paths.connection} element={<ConnectionPage />} />
              <Route path="*" element={<Navigate to={paths.home} replace />} />
            </Route>
          </Routes>
        </Suspense>
      ) : can(session, 'view_stock') ? (
        // Jefe de despacho: su inicio es el stock; no proyecta ni ve dashboards.
        <Suspense fallback={null}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<StockPage />} />
              {can(session, 'view_production') && <Route path={paths.production} element={<ProductionPage />} />}
              {can(session, 'view_production') && <Route path={paths.forecast} element={<ForecastPage />} />}
              <Route path={paths.notifications} element={<NotificationsPage />} />
              <Route path={paths.profile} element={<ProfilePage />} />
              <Route path={paths.profileSettings} element={<ProfileSettingsPage />} />
              <Route path={paths.connection} element={<ConnectionPage />} />
              <Route path={paths.password} element={<ChangePasswordPage />} />
              <Route path="*" element={<Navigate to={paths.home} replace />} />
            </Route>
          </Routes>
        </Suspense>
      ) : (
        <Suspense fallback={null}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path={paths.register} element={<NewProjectionPage />} />
              <Route path={paths.registered} element={<SuccessPage />} />
              <Route path={paths.mine} element={<MyProjectionsPage />} />
              <Route path={paths.history} element={<HistoryPage />} />
              <Route path="/proyecciones/:date" element={<DayDetailPage />} />
              <Route path={paths.dashSummary} element={<DashboardSummaryPage />} />
              <Route path={paths.dashVersus} element={<DashboardVersusPage />} />
              <Route path={paths.dashStatus} element={<DashboardStatusPage />} />
              <Route path={paths.products} element={<ProductsPage />} />
              <Route path={paths.notifications} element={<NotificationsPage />} />
              <Route path={paths.profile} element={<ProfilePage />} />
              <Route path={paths.profileSettings} element={<ProfileSettingsPage />} />
              <Route path={paths.connection} element={<ConnectionPage />} />
              <Route path={paths.password} element={<ChangePasswordPage />} />
              <Route path="*" element={<Navigate to={paths.home} replace />} />
            </Route>
          </Routes>
        </Suspense>
      )}
    </>
  )
}

const brandSchema = z.enum(['noraves', 'rocio'])

export function App({ container }: { container: Container }) {
  const persistBrand = useCallback((b: BrandId) => container.preferences.set('nv_brand', b), [container])
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
      <ContainerProvider container={container}>
        <QueryClientProvider client={queryClient}>
          <BrandProvider
            initial={container.preferences.get('nv_brand', brandSchema) ?? 'noraves'}
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
      </ContainerProvider>
    </ErrorBoundary>
  )
}
