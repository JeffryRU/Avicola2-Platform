import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { toast } from 'sonner'
import { AppShell } from '@/app/AppShell'
import { paths, routePatterns } from '@/app/routes'
import { can, hasTeamView, type Session } from '@/shared/domain/session'
import { useRealtime } from '@/features/notifications'
import { useSession } from '@/features/auth'
import { useFlushQueue } from '@/features/projections'

/*
 * Todo lo que solo existe con sesión: estructura, rutas por rol, cola offline y tiempo real.
 * App.tsx lo carga a demanda, así la pantalla de login descarga solo lo suyo.
 */

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

/** La app con sesión: efectos de la sesión y las rutas de su rol. */
export function AuthenticatedApp({ session }: { session: Session }) {
  useOutboxSync()
  useRealtime()
  return hasTeamView(session) ? (
    <TeamRoutes session={session} />
  ) : can(session, 'view_stock') ? (
    <DispatchRoutes session={session} />
  ) : (
    <SellerRoutes />
  )
}
