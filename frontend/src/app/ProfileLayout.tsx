import { KeyRound, Palette, UserRound, type LucideIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { paths } from '@/app/routes'
import { initials } from '@/shared/domain/format'
import { roleLabel } from '@/shared/domain/session'
import { useRequiredSession } from '@/features/auth'
import { cn } from '@/shared/ui/lib/utils'

interface Tab {
  to: string
  label: string
  /** Nombre corto para el celular (si el largo no entra). */
  short?: string
  icon: LucideIcon
  end?: boolean
}

/** Pestañas de la cuenta, en orden. */
const TABS: Tab[] = [
  { to: paths.profile, label: 'Mi cuenta', icon: UserRound, end: true },
  { to: paths.appearance, label: 'Apariencia y accesibilidad', short: 'Apariencia', icon: Palette },
  { to: paths.password, label: 'Contraseña', icon: KeyRound },
]

/**
 * Cuenta y ajustes: quién eres arriba, pestañas debajo y la sección elegida, todo centrado.
 * Las pestañas reemplazan el encabezado (y su «Volver») de cada sección: se cambia de una a otra
 * sin salir. Cerrar sesión está en el menú (escritorio) o al pie de «Mi cuenta» (celular).
 */
export function ProfileLayout() {
  const { seller } = useRequiredSession()
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-4 px-4 pt-5 pb-4 dsk:px-0 dsk:pt-0">
        <span
          aria-hidden
          className="grid size-14 flex-none place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground hc:bg-brand-accent hc:text-foreground"
        >
          {initials(seller.name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold dsk:text-2xl hc:font-extrabold">{seller.name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {roleLabel(seller)} · @{seller.username}
          </p>
        </div>
      </div>
      <nav
        aria-label="Cuenta y ajustes"
        className="sticky top-0 z-20 flex [scrollbar-width:none] justify-center-safe gap-1 overflow-x-auto border-b border-border bg-background px-2 dsk:static dsk:px-0 hc:border-b-2 hc:border-foreground"
      >
        {TABS.map(({ to, label, short, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex min-h-11 flex-none items-center gap-2 px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                'hc:font-semibold hc:text-foreground',
                isActive &&
                  'font-semibold text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary hc:after:h-1 hc:after:bg-foreground',
              )
            }
          >
            <Icon aria-hidden className="size-4 flex-none" />
            {short ? (
              <>
                <span className="dsk:hidden">{short}</span>
                <span className="hidden dsk:inline">{label}</span>
              </>
            ) : (
              label
            )}
          </NavLink>
        ))}
      </nav>
      {/* El encabezado propio de cada sección sobra bajo las pestañas. */}
      <div className="pt-1 dsk:pt-5 [&>div>header:first-child]:hidden">
        <Outlet />
      </div>
    </div>
  )
}
