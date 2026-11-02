import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { AppShell } from '@/app/AppShell'
import type { Container } from '@/app/container'
import { ContainerProvider, useContainer } from '@/app/di'
import { paths } from '@/app/routes'
import { isSupervisor } from '@/modules/auth/domain/session'
import { ForcedPasswordChange } from '@/modules/auth/ui/ChangePasswordPage'
import { LoginPage } from '@/modules/auth/ui/LoginPage'
import { useSession } from '@/modules/auth/ui/use-session'
import { BrandProvider, type BrandId } from '@/ui/components/brand'
import { ErrorBoundary } from '@/ui/components/error-boundary'
import { Splash } from '@/ui/components/feedback'
import { Toaster } from '@/ui/components/shadcn/sonner'

/** Pantallas cargadas a demanda: el celular descarga solo lo que abre. */
const AccountsPage = lazy(() => import('@/modules/accounts/ui/AccountsPage').then((m) => ({ default: m.AccountsPage })))
const ChangePasswordPage = lazy(() =>
  import('@/modules/auth/ui/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })),
)
const ConnectionPage = lazy(() =>
  import('@/modules/planning/ui/pages/ConnectionPage').then((m) => ({ default: m.ConnectionPage })),
)
const DashboardStatusPage = lazy(() =>
  import('@/modules/planning/ui/pages/DashboardStatusPage').then((m) => ({ default: m.DashboardStatusPage })),
)
const DashboardSummaryPage = lazy(() =>
  import('@/modules/planning/ui/pages/DashboardSummaryPage').then((m) => ({ default: m.DashboardSummaryPage })),
)
const DashboardVersusPage = lazy(() =>
  import('@/modules/planning/ui/pages/DashboardVersusPage').then((m) => ({ default: m.DashboardVersusPage })),
)
const DayDetailPage = lazy(() =>
  import('@/modules/planning/ui/pages/DayDetailPage').then((m) => ({ default: m.DayDetailPage })),
)
const HomePage = lazy(() => import('@/modules/planning/ui/pages/HomePage').then((m) => ({ default: m.HomePage })))
const MyProjectionsPage = lazy(() =>
  import('@/modules/planning/ui/pages/MyProjectionsPage').then((m) => ({ default: m.MyProjectionsPage })),
)
const NewProjectionPage = lazy(() =>
  import('@/modules/planning/ui/pages/NewProjectionPage').then((m) => ({ default: m.NewProjectionPage })),
)
const NotificationsPage = lazy(() =>
  import('@/modules/planning/ui/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
const ProductsPage = lazy(() =>
  import('@/modules/planning/ui/pages/ProductsPage').then((m) => ({ default: m.ProductsPage })),
)
const ProfilePage = lazy(() =>
  import('@/modules/planning/ui/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const SuccessPage = lazy(() =>
  import('@/modules/planning/ui/pages/SuccessPage').then((m) => ({ default: m.SuccessPage })),
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
      if (r.sent) client.invalidateQueries({ queryKey: ['window'] })
      r.rejected.forEach((m) => toast.error(`Un envío fue rechazado: ${m}`))
      if (!silent && r.sent) toast.success(`${r.sent} ${r.sent === 1 ? 'envío sincronizado' : 'envíos sincronizados'}`)
    }
    const t = setTimeout(() => flush(true), 2500)
    const online = () => flush(false)
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
      ) : isSupervisor(session.seller) ? (
        <Suspense fallback={null}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to={paths.dashSummary} replace />} />
              <Route path={paths.accounts} element={<AccountsPage />} />
              <Route path={paths.dashSummary} element={<DashboardSummaryPage />} />
              <Route path={paths.dashVersus} element={<DashboardVersusPage />} />
              <Route path={paths.dashStatus} element={<DashboardStatusPage />} />
              <Route path={paths.products} element={<ProductsPage />} />
              <Route path={paths.profile} element={<ProfilePage onBrandChange={showSplash} />} />
              <Route path={paths.password} element={<ChangePasswordPage />} />
              <Route path={paths.connection} element={<ConnectionPage />} />
              <Route path="*" element={<Navigate to={paths.dashSummary} replace />} />
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
              <Route path="/proyecciones/:date" element={<DayDetailPage />} />
              <Route path={paths.dashSummary} element={<DashboardSummaryPage />} />
              <Route path={paths.dashVersus} element={<DashboardVersusPage />} />
              <Route path={paths.dashStatus} element={<DashboardStatusPage />} />
              <Route path={paths.products} element={<ProductsPage />} />
              <Route path={paths.notifications} element={<NotificationsPage />} />
              <Route path={paths.profile} element={<ProfilePage onBrandChange={showSplash} />} />
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
            <Toaster position="bottom-center" offset={96} mobileOffset={{ bottom: 96 }} />
          </BrandProvider>
        </QueryClientProvider>
      </ContainerProvider>
    </ErrorBoundary>
  )
}
