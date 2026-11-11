import { useEffect, useState } from 'react'
import {
  BarChart3,
  Bell,
  Bird,
  Box,
  ChevronDown,
  ClipboardList,
  Factory,
  History,
  Home,
  LockOpen,
  LogOut,
  PackageCheck,
  Plus,
  Settings,
  User,
  Users,
  TrendingUp,
} from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useContainer } from '@/app/di'
import { InstallBanner } from '@/app/install'
import { DASHBOARDS, isFlowPath, paths } from '@/app/routes'
import { initials } from '@/shared/domain/format'
import { can, hasTeamView, roleLabel } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { useUnreadCount } from '@/features/notifications/ui/hooks'
import { useUnlocks } from '@/features/editing/ui/hooks'
import { Logo } from '@/shared/ui/components/brand'
import { cn } from '@/shared/ui/lib/utils'

const itemCls = (active: boolean) =>
  cn(
    'flex w-full items-center gap-3 rounded-xl px-3 py-[11px] text-left font-semibold text-ink-2 transition-colors hover:bg-muted hover:text-foreground [&>svg]:size-5',
    active && 'bg-primary text-white shadow-[0_6px_16px_var(--primary-ring)] hover:bg-primary hover:text-white',
  )

function SideItem({
  to,
  icon,
  label,
  extra,
  end,
}: {
  to: string
  icon: React.ReactNode
  label: string
  extra?: React.ReactNode
  end?: boolean
}) {
  const { pathname } = useLocation()
  // "Registrar" sigue activo en la pantalla de éxito y "Mis proyecciones" en el detalle.
  return (
    <NavLink to={to} end={end} className={({ isActive }) => itemCls(isActive || (!end && pathname.startsWith(to)))}>
      {icon}
      <span>{label}</span>
      {extra}
    </NavLink>
  )
}

function Sidebar() {
  const { auth } = useContainer()
  const session = useRequiredSession()
  const { seller } = session
  const { pathname } = useLocation()
  const unread = useUnreadCount()
  const inDash = pathname.startsWith('/dashboards')
  const [expanded, setExpanded] = useState(true)
  // El supervisor no registra proyecciones: administra usuarios y ve los dashboards del equipo.
  const supervisor = hasTeamView(session)
  const editing = can(session, 'manage_editing')
  const pending = (useUnlocks(editing).data ?? []).filter((u) => u.status === 'requested').length
  // El jefe de despacho solo ve el stock: no proyecta ni tiene dashboards.
  const dispatch = !supervisor && can(session, 'view_stock')
  const bell = (
    <SideItem
      to={paths.notifications}
      icon={<Bell />}
      label="Notificaciones"
      extra={
        unread > 0 && (
          <em className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[11px] font-extrabold text-white not-italic">
            {unread}
          </em>
        )
      }
    />
  )
  const footer = (
    <div className="mt-auto grid gap-0.5 pt-4">
      <div className="mb-2 flex items-center gap-3 px-3 py-2.5">
        <div className="grid size-10 flex-none place-items-center rounded-full bg-secondary text-sm font-extrabold text-primary">
          {initials(seller.name)}
        </div>
        <div className="min-w-0 flex-1">
          <b className="block text-sm">{seller.name}</b>
          <small className="text-muted-foreground">{roleLabel(seller)}</small>
        </div>
      </div>
      <SideItem to={paths.profile} icon={<Settings />} label="Configuración" />
      <button type="button" className={itemCls(false)} onClick={auth.logout}>
        <LogOut />
        <span>Cerrar sesión</span>
      </button>
    </div>
  )
  const asideCls =
    'sticky top-0 hidden h-dvh w-[268px] flex-none flex-col overflow-y-auto border-r bg-side px-3.5 pt-[22px] pb-4 dsk:flex'
  if (dispatch) {
    return (
      <aside className={asideCls}>
        <div className="px-2.5 pb-[22px]">
          <Logo />
        </div>
        <nav className="grid gap-0.5" aria-label="Principal">
          <SideItem to={paths.home} end icon={<PackageCheck />} label="Stock de despacho" />
          {can(session, 'view_production') && <SideItem to={paths.production} icon={<Factory />} label="Producción" />}
          {can(session, 'view_production') && <SideItem to={paths.forecast} icon={<TrendingUp />} label="Pronóstico" />}
          {bell}
        </nav>
        {footer}
      </aside>
    )
  }
  return (
    <aside className={asideCls}>
      <div className="px-2.5 pb-[22px]">
        <Logo />
      </div>
      <nav className="grid gap-0.5" aria-label="Principal">
        <SideItem to={paths.home} end icon={<Home />} label="Inicio" />
        <SideItem to={paths.register} icon={<Plus />} label="Registrar" />
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className={cn(itemCls(false), inDash && 'bg-secondary text-primary hover:bg-secondary hover:text-primary')}
        >
          <BarChart3 />
          <span>Dashboards</span>
          <ChevronDown className={cn('ml-auto !size-[18px] transition-transform', expanded && 'rotate-180')} />
        </button>
        {expanded && (
          <div className="grid gap-0.5 py-1 pl-[22px]">
            {DASHBOARDS.map((d) => (
              <NavLink
                key={d.to}
                to={d.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-[10px] px-3 py-[9px] text-sm font-semibold text-muted-foreground before:size-1.5 before:rounded-full hover:text-foreground',
                    isActive && 'bg-secondary text-primary before:bg-primary',
                  )
                }
              >
                {d.label}
              </NavLink>
            ))}
          </div>
        )}
        {supervisor ? (
          <>
            {can(session, 'manage_accounts') && <SideItem to={paths.accounts} icon={<Users />} label="Usuarios" />}
            {editing && (
              <SideItem
                to={paths.unlocks}
                icon={<LockOpen />}
                label="Habilitaciones"
                extra={
                  pending > 0 && (
                    <em className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-warn px-1.5 text-[11px] font-extrabold text-white not-italic">
                      {pending}
                    </em>
                  )
                }
              />
            )}
          </>
        ) : (
          <SideItem to={paths.mine} icon={<ClipboardList />} label="Mis proyecciones" />
        )}
        {can(session, 'view_saca') && <SideItem to={paths.saca} icon={<Bird />} label="Cálculo de saca" />}
        {can(session, 'view_production') && <SideItem to={paths.production} icon={<Factory />} label="Producción" />}
        {can(session, 'view_production') && <SideItem to={paths.forecast} icon={<TrendingUp />} label="Pronóstico" />}
        {can(session, 'view_stock') && <SideItem to={paths.stock} icon={<PackageCheck />} label="Stock de despacho" />}
        <SideItem to={paths.history} icon={<History />} label="Historial" />
        <SideItem to={paths.products} icon={<Box />} label="Productos" />
        {bell}
      </nav>
      {footer}
    </aside>
  )
}

const BOTTOM = [
  { to: paths.home, icon: Home, label: 'Inicio', end: true },
  { to: paths.register, icon: Plus, label: 'Registrar' },
  { to: paths.mine, icon: ClipboardList, label: 'Mis proyecciones' },
  { to: paths.profile, icon: User, label: 'Perfil' },
]
const BOTTOM_SUPERVISOR = [
  { to: paths.home, icon: Home, label: 'Inicio', end: true },
  { to: paths.dashSummary, icon: BarChart3, label: 'Dashboards', end: false },
  { to: paths.accounts, icon: Users, label: 'Usuarios', end: false },
  { to: paths.notifications, icon: Bell, label: 'Avisos', end: false },
  { to: paths.profile, icon: User, label: 'Perfil', end: false },
]

const BOTTOM_DISPATCH = [
  { to: paths.home, icon: PackageCheck, label: 'Stock', end: true },
  { to: paths.production, icon: Factory, label: 'Producción', end: false },
  { to: paths.forecast, icon: TrendingUp, label: 'Pronóstico', end: false },
  { to: paths.notifications, icon: Bell, label: 'Avisos', end: false },
  { to: paths.profile, icon: User, label: 'Perfil', end: false },
]

function BottomNav() {
  const session = useRequiredSession()
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
      className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-white/95 px-1.5 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] backdrop-blur-md dsk:hidden"
    >
      {items.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-[3px] py-1 text-[11.5px] font-semibold text-faint transition-colors',
              isActive && 'text-primary [&>svg]:animate-pop',
            )
          }
        >
          <span className="relative">
            <Icon className="size-[22px]" />
            {to === paths.notifications && unread > 0 && (
              <i className="absolute -top-0.5 -right-1 size-[9px] rounded-full border-2 border-white bg-destructive" />
            )}
          </span>
          {label}
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
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="@container/main min-w-0 flex-1">
        <div
          key={pathname}
          className={cn(
            'mx-auto max-w-[1360px] animate-enter dsk:px-[30px] dsk:pt-[26px] dsk:pb-12',
            flow ? 'pb-6' : 'pb-24',
          )}
        >
          <Outlet />
        </div>
      </main>
      {!flow && <BottomNav />}
      {/* Aviso de instalación solo en la pantalla de entrada de cada rol. */}
      {(pathname === paths.home || pathname === paths.dashSummary) && <InstallBanner />}
    </div>
  )
}
