import { ChevronDown, LogOut, Palette, Settings, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router'
import { paths } from '@/app/routes'
import { useLogout, useRequiredSession } from '@/features/auth'
import { VersionChip } from '@/features/versions'
import { initials } from '@/shared/domain/format'
import { roleLabel } from '@/shared/domain/session'
import { LOGOUT_LABEL } from '@/shared/types/labels'
import { LookButton } from '@/shared/ui/components/look-panel'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/components/shadcn/dropdown-menu'
import { ThemeToggle } from '@/shared/ui/components/theme-toggle'

const ACCOUNT_LABEL = 'Tu cuenta'
const MY_PROFILE = 'Mi perfil'
const APPEARANCE_LABEL = 'Apariencia y accesibilidad'

/** La cuenta: avatar, nombre y rol; abre Perfil, Apariencia, la versión y Cerrar sesión. */
function UserMenu() {
  const { seller } = useRequiredSession()
  const logout = useLogout()
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${ACCOUNT_LABEL}: ${seller.name}`}
        className="min-h-control flex items-center gap-2.5 rounded-full py-1 pr-3 pl-1 text-left transition-colors hover:bg-topbar-hover hc:border-2 hc:border-foreground"
      >
        <span
          aria-hidden
          className="grid size-8 flex-none place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground hc:bg-brand-accent hc:text-foreground"
        >
          {initials(seller.name)}
        </span>
        <span className="hidden min-w-0 leading-tight @3xl/main:grid">
          <b className="max-w-48 truncate text-sm font-semibold">{seller.name}</b>
          <small className="max-w-48 truncate text-xs text-topbar-muted">{roleLabel(seller)}</small>
        </span>
        <ChevronDown aria-hidden className="size-4 text-topbar-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64">
        <DropdownMenuLabel className="grid font-normal">
          <b className="truncate font-semibold">{seller.name}</b>
          <small className="truncate text-xs text-muted-foreground">
            {roleLabel(seller)} · @{seller.username}
          </small>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate(paths.profile)}>
          <UserRound aria-hidden /> {MY_PROFILE}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate(paths.appearance)}>
          <Palette aria-hidden /> {APPEARANCE_LABEL}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate(paths.profileSettings)}>
          <Settings aria-hidden /> Datos de la cuenta
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-1">
          <VersionChip />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => logout.mutate()}>
          <LogOut aria-hidden /> {LOGOUT_LABEL}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const ROUND =
  'size-10 rounded-full text-topbar-muted hover:bg-topbar-hover hover:text-topbar-foreground hc:text-foreground'

/**
 * Franja de arriba (solo escritorio), fija al hacer scroll: a la derecha apariencia, modo oscuro
 * y la cuenta (la fecha ya la dice cada pantalla en su título). Su color lo pone el tema (se cambia en Apariencia).
 */
export function UserBar() {
  return (
    <div className="sticky top-0 z-30 hidden h-16 items-center gap-1.5 border-b border-topbar-border bg-topbar px-9 text-topbar-foreground dsk:flex hc:border-b-2 hc:border-foreground">
      <span className="flex-1" />
      <LookButton className={ROUND} />
      <ThemeToggle className={ROUND} />
      <span aria-hidden className="mx-1 h-6 w-px bg-topbar-border" />
      <UserMenu />
    </div>
  )
}
