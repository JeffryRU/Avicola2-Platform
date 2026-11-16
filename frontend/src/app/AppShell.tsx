import { useEffect } from 'react'
import { Bell, LogOut } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { InstallBanner } from '@/app/install'
import { DASHBOARDS, isFlowPath, paths } from '@/app/routes'
import { can, hasTeamView, roleLabel, type Session } from '@/shared/domain/session'
import { useLogout, useRequiredSession } from '@/features/auth'
import { useUnreadCount } from '@/features/notifications'
import { useUnlocks, MY_REQUESTS_TITLE, UNLOCKS_TITLE } from '@/features/editing'
import { Logo } from '@/shared/ui/components/brand'
import { cn } from '@/shared/ui/lib/utils'
import { LOGOUT_LABEL } from '@/shared/types/labels'
import { STOCK_TITLE } from '@/features/stock'
import { FORECAST_NAV_LABEL, PRODUCTION_TITLE } from '@/features/production'
import { SACA_TITLE } from '@/features/saca'

interface NavItem {
  to: string
  label: string
  /** Solo activo en la ruta exacta (Inicio). */
  end?: boolean
  /** Cifra a la derecha (pendientes, no leídas). */
  count?: number
}
interface NavGroup {
  title?: string
  items: NavItem[]
}

/** Menú lateral por rol: grupos con título, sin iconos (docs/diseno/sistema.md). */
function navGroups(session: Session, counts: { unread: number; unlocks: number }): NavGroup[] {
  const production = can(session, 'view_production')
  const bell: NavItem = { to: paths.notifications, label: 'Notificaciones', count: counts.unread }
  // El jefe de despacho solo ve el stock: no proyecta ni tiene dashboards.
  if (!hasTeamView(session) && can(session, 'view_stock')) {
    return [
      {
        items: [
          { to: paths.home, label: STOCK_TITLE, end: true },
          ...(production
            ? [
                { to: paths.production, label: PRODUCTION_TITLE },
                { to: paths.forecast, label: FORECAST_NAV_LABEL },
              ]
            : []),
          bell,
        ],
      },
    ]
  }
  const dashboards: NavGroup = { title: 'Dashboards', items: DASHBOARDS.map((d) => ({ to: d.to, label: d.label })) }
  const operation: NavItem[] = [
    ...(can(session, 'view_saca') ? [{ to: paths.saca, label: SACA_TITLE }] : []),
    ...(can(session, 'view_stock') ? [{ to: paths.stock, label: STOCK_TITLE }] : []),
    ...(production
      ? [
          { to: paths.production, label: PRODUCTION_TITLE },
          { to: paths.forecast, label: FORECAST_NAV_LABEL },
        ]
      : []),
  ]
  if (hasTeamView(session)) {
    // El supervisor no registra proyecciones propias: administra el equipo y ve sus dashboards.
    return [
      {
        items: [
          { to: paths.home, label: 'Inicio', end: true },
          { to: paths.register, label: 'Registrar' },
        ],
      },
      ...(operation.length ? [{ title: 'Operación', items: operation }] : []),
      dashboards,
      {
        title: 'Equipo',
        items: [
          { to: paths.history, label: 'Historial' },
          ...(can(session, 'manage_editing')
            ? [{ to: paths.unlocks, label: UNLOCKS_TITLE, count: counts.unlocks }]
            : []),
          ...(can(session, 'manage_accounts') ? [{ to: paths.accounts, label: 'Usuarios' }] : []),
        ],
      },
      { title: 'Consultas', items: [{ to: paths.products, label: 'Productos' }, bell] },
    ]
  }
  return [
    {
      items: [
        { to: paths.home, label: 'Inicio', end: true },
        { to: paths.register, label: 'Registrar' },
        { to: paths.mine, label: 'Mis proyecciones' },
        { to: paths.requests, label: MY_REQUESTS_TITLE },
      ],
    },
    ...(operation.length ? [{ title: 'Operación', items: operation }] : []),
    dashboards,
    {
      title: 'Consultas',
      items: [{ to: paths.history, label: 'Historial' }, { to: paths.products, label: 'Productos' }, bell],
    },
  ]
}

const sideItemCls = (active: boolean) =>
  cn(
    'flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-base text-ink-2 transition-colors hover:bg-muted hover:text-foreground',
    'hc:min-h-9 hc:text-md hc:font-semibold hc:text-foreground',
    active &&
      'bg-nav-active font-semibold text-nav-active-foreground hover:bg-nav-active hover:text-nav-active-foreground hc:font-extrabold',
  )

function SideItem({ to, label, end, count }: NavItem) {
  const { pathname } = useLocation()
  // "Registrar" sigue activo en la pantalla de éxito y "Mis proyecciones" en el detalle.
  return (
    <NavLink to={to} end={end} className={({ isActive }) => sideItemCls(isActive || (!end && pathname.startsWith(to)))}>
      <span className="min-w-0 flex-1">{label}</span>
      {!!count && (
        <span
          className={cn('num text-sm font-medium hc:font-bold', to === paths.notifications ? 'text-bad' : 'text-warn')}
          aria-label={to === paths.notifications ? `${count} sin leer` : `${count} pendientes`}
        >
          {count}
        </span>
      )}
    </NavLink>
  )
}

function Sidebar() {
  const logout = useLogout()
  const session = useRequiredSession()
  const { seller } = session
  const unread = useUnreadCount()
  const editing = can(session, 'manage_editing')
  const unlocks = (useUnlocks(editing).data ?? []).filter((u) => u.status === 'requested').length
  const groups = navGroups(session, { unread, unlocks })
  return (
    // El fondo y el borde van en el contenedor que se estira a todo el alto de la página;
    // lo de adentro se queda fijo al hacer scroll (antes el fondo se cortaba).
    <aside className="hidden w-60 flex-none border-r border-border bg-side dsk:block hc:border-r-2 hc:border-foreground">
      <div className="sticky top-0 flex max-h-dvh min-h-dvh flex-col overflow-y-auto px-3 pt-5 pb-4 hc:top-14 hc:max-h-[calc(100dvh-3.5rem)] hc:min-h-[calc(100dvh-3.5rem)]">
        <div className="px-2.5 pb-4 hc:hidden">
          <Logo />
        </div>
        <nav aria-label="Principal" className="grid gap-0.5">
          {groups.map((g, i) => (
            <div key={g.title ?? i} className={cn('grid gap-px', i > 0 && 'mt-3.5')}>
              {g.title && <div className="eyebrow mb-1 px-2.5 hc:text-xs hc:text-foreground">{g.title}</div>}
              {g.items.map((item) => (
                <SideItem key={item.to} {...item} />
              ))}
            </div>
          ))}
        </nav>
        {/* Pie compacto: la versión ya está en la franja de arriba y en Perfil. */}
        <div className="mt-auto grid gap-px pt-5">
          <div className="flex items-center gap-2 border-t border-border pt-2.5 pb-1 pl-2.5 hc:border-t-heavy hc:border-foreground">
            <div className="min-w-0 flex-1">
              <b className="block truncate text-base font-medium">{seller.name}</b>
              <small className="text-xs text-muted-foreground">{roleLabel(seller)}</small>
            </div>
            <button
              type="button"
              aria-label={LOGOUT_LABEL}
              title={LOGOUT_LABEL}
              onClick={() => logout.mutate()}
              className="grid size-control flex-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
          <SideItem to={paths.profile} label="Perfil y apariencia" />
        </div>
      </div>
    </aside>
  )
}

/**
 * Barra superior. En celular: marca y campana. En escritorio solo aparece en alto contraste
 * (barra de la marca, como en la dirección B), con el nombre de quien entró.
 */
function TopBar() {
  const { seller } = useRequiredSession()
  const unread = useUnreadCount()
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-side pr-1 pl-4 dsk:hidden hc:border-0 hc:bg-head hc:dsk:sticky hc:dsk:top-0 hc:dsk:z-30 hc:dsk:flex hc:dsk:px-7">
      <Link to={paths.home} aria-label="Inicio" className="flex min-w-0 flex-1 items-center">
        <span className="hc:hidden">
          <Logo compact />
        </span>
        <span className="hidden hc:block">
          <Logo onDark compact />
        </span>
      </Link>
      <span className="hidden text-sm text-head-muted hc:dsk:inline">{seller.name}</span>
      <Link
        to={paths.notifications}
        aria-label={unread > 0 ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'}
        className="relative grid size-touch place-items-center rounded-md text-foreground hover:bg-muted dsk:hidden hc:text-head-foreground hc:hover:bg-transparent"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <i className="absolute top-2.5 right-2.5 size-2 rounded-full bg-bad ring-2 ring-side hc:ring-head" />
        )}
      </Link>
    </header>
  )
}

interface BottomItem {
  to: string
  label: string
  end?: boolean
}
const BOTTOM: BottomItem[] = [
  { to: paths.home, label: 'Inicio', end: true },
  { to: paths.register, label: 'Registrar' },
  { to: paths.mine, label: 'Proyecciones' },
  { to: paths.profile, label: 'Perfil' },
]
const BOTTOM_SUPERVISOR: BottomItem[] = [
  { to: paths.home, label: 'Inicio', end: true },
  { to: paths.dashSummary, label: 'Dashboards' },
  { to: paths.accounts, label: 'Usuarios' },
  { to: paths.notifications, label: 'Avisos' },
  { to: paths.profile, label: 'Perfil' },
]
const BOTTOM_DISPATCH: BottomItem[] = [
  { to: paths.home, label: 'Stock', end: true },
  { to: paths.production, label: PRODUCTION_TITLE },
  { to: paths.forecast, label: FORECAST_NAV_LABEL },
  { to: paths.notifications, label: 'Avisos' },
  { to: paths.profile, label: 'Perfil' },
]

function BottomNav() {
  const session = useRequiredSession()
  const { pathname } = useLocation()
  const items = hasTeamView(session)
    ? BOTTOM_SUPERVISOR.filter((i) => i.to !== paths.accounts || can(session, 'manage_accounts'))
    : can(session, 'view_stock')
      ? BOTTOM_DISPATCH
      : BOTTOM
  const unread = useUnreadCount()
  return (
    <nav
      aria-label="Navegación"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-side pb-[env(safe-area-inset-bottom)] dsk:hidden hc:border-t-heavy hc:border-foreground hc:bg-surface"
    >
      {items.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive: exact }) => {
            // «Dashboards» sigue activo en Vs. venta, Estado y el detalle del día.
            const isActive = exact || (to === paths.dashSummary && pathname.startsWith(paths.dashboards))
            return cn(
              'relative flex h-14 items-center justify-center gap-1 px-0.5 text-center text-xs leading-tight text-ink-2 transition-colors',
              'hc:h-15 hc:text-xs hc:font-semibold hc:text-foreground',
              isActive &&
                'font-semibold text-selected-foreground before:absolute before:inset-x-2 before:top-0 before:h-0.5 before:bg-primary hc:bg-nav-active hc:font-extrabold hc:text-nav-active-foreground hc:before:hidden',
            )
          }}
        >
          {label}
          {to === paths.notifications && unread > 0 && (
            <i aria-label={`${unread} sin leer`} className="size-1.5 flex-none rounded-full bg-bad" />
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/** Estructura: menú lateral en escritorio y barra inferior en celular. */
export function AppShell() {
  const { pathname } = useLocation()
  const flow = isFlowPath(pathname)
  // Cada pantalla empieza arriba (scrollTo puede devolver una Promise: no se retorna).
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return (
    <div className="min-h-dvh">
      {!flow && <TopBar />}
      <div className="flex min-h-dvh">
        <Sidebar />
        <main className="@container/main min-w-0 flex-1">
          <div
            key={pathname}
            className={cn('mx-auto max-w-7xl animate-enter dsk:px-9 dsk:pt-7 dsk:pb-12', flow ? 'pb-6' : 'pb-24')}
          >
            <Outlet />
          </div>
        </main>
      </div>
      {!flow && <BottomNav />}
      {/* Aviso de instalación solo en la pantalla de entrada de cada rol. */}
      {(pathname === paths.home || pathname === paths.dashSummary) && <InstallBanner />}
    </div>
  )
}
