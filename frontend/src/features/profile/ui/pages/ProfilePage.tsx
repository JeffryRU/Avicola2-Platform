import { useId, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { InstallOption } from '@/app/install'
import { paths } from '@/app/routes'
import { contrastFromSwitch, type ThemePreference } from '@/shared/domain/appearance'
import { initials } from '@/shared/domain/format'
import { can, hasTeamView, roleLabel } from '@/shared/domain/session'
import { useLogout, useRequiredSession } from '@/features/auth'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Segmented } from '@/shared/ui/components/segmented'
import { Switch } from '@/shared/ui/components/shadcn/switch'
import { useAppearance } from '@/shared/ui/hooks/use-appearance'
import { VersionChip } from '@/features/versions'
import { LOGOUT_LABEL } from '@/shared/types/labels'

const optCls =
  'flex min-h-touch w-full items-center gap-3 border-b border-rule px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted dsk:px-5'

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
]

/** Una opción del perfil: título, descripción y chevron. */
function Option({ to, title, sub }: { to: string; title: string; sub: string }) {
  return (
    <Link to={to} className={optCls}>
      <OptionText title={title} sub={sub} />
      <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden />
    </Link>
  )
}

function OptionText({ title, sub }: { title: ReactNode; sub: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <b className="block font-medium">{title}</b>
      <small className="block text-sm text-muted-foreground">{sub}</small>
    </span>
  )
}

/** Tema (sistema, claro u oscuro) y alto contraste. Se guardan en este equipo. */
function AppearanceSection() {
  const { preference, resolved, system, setPreference } = useAppearance()
  const contrastId = useId()
  const high = resolved.contrast === 'high'
  return (
    <Section title="Apariencia" className="mb-4">
      <div className="grid gap-2 border-b border-rule px-4 py-3.5 dsk:px-5">
        <span className="font-medium">Tema</span>
        <Segmented
          value={preference.theme}
          options={THEME_OPTIONS}
          onChange={(theme) => setPreference({ ...preference, theme })}
          className="w-full dsk:w-96"
          full
        />
        <small className="text-sm text-muted-foreground">
          «Sistema» sigue el modo claro u oscuro de tu equipo
          {preference.theme === 'system' ? ` (ahora: ${system.prefersDark ? 'oscuro' : 'claro'})` : ''}.
        </small>
      </div>
      <div className="flex items-start gap-4 px-4 py-3.5 dsk:px-5">
        <label htmlFor={contrastId} className="min-w-0 flex-1 cursor-pointer">
          <b className="block font-medium">Alto contraste</b>
          <small className="block text-sm text-muted-foreground">
            Letra más grande, más contraste y bordes marcados. Útil a pleno sol.
            {system.prefersMoreContrast &&
              ' Tu equipo pide más contraste, por eso viene activado; puedes apagarlo aquí.'}
          </small>
        </label>
        <Switch
          id={contrastId}
          checked={high}
          onCheckedChange={(on) => setPreference({ ...preference, contrast: contrastFromSwitch(on, system) })}
          className="mt-1"
        />
      </div>
    </Section>
  )
}

export function ProfilePage() {
  const logout = useLogout()
  const session = useRequiredSession()
  const { seller } = session
  // El jefe de despacho no proyecta: no tiene historial de proyecciones.
  const projects = hasTeamView(session) || !can(session, 'view_stock')
  return (
    <div>
      <PageHeader title="Perfil" />
      <PageBody className="dsk:max-w-2xl">
        <Section className="mb-4 flex items-center gap-4 p-4 dsk:p-5">
          <div
            aria-hidden
            className="grid size-12 flex-none place-items-center rounded-full bg-selected text-md font-semibold text-selected-foreground"
          >
            {initials(seller.name)}
          </div>
          <div className="min-w-0">
            <b className="block text-lg font-semibold hc:font-extrabold">{seller.name}</b>
            <span className="text-muted-foreground">{roleLabel(seller)}</span>
          </div>
        </Section>
        <AppearanceSection />
        <Section title="Cuenta y herramientas" className="mb-4">
          <Option to={paths.profileSettings} title="Configuración de perfil" sub="Tu nombre y los datos de tu cuenta" />
          {can(session, 'manage_editing') && (
            <Option to={paths.unlocks} title="Habilitaciones" sub="Horario de corte y solicitudes de edición" />
          )}
          {can(session, 'view_saca') && (
            <Option to={paths.saca} title="Cálculo de saca" sub="Cuánto pedir a granja cada día" />
          )}
          {hasTeamView(session) && can(session, 'view_stock') && (
            <Option to={paths.stock} title="Stock de despacho" sub="Lo que quedó en despacho cada día" />
          )}
          {projects && (
            <Option to={paths.history} title="Historial de cambios" sub="Quién creó o modificó cada proyección" />
          )}
          <Option to={paths.connection} title="Conexión" sub="Dónde se guardan las proyecciones" />
          <InstallOption className={optCls} />
          <Option to={paths.password} title="Cambiar contraseña" sub="Cierra tus sesiones en otros equipos" />
          <button type="button" className={optCls} onClick={() => logout.mutate()}>
            <OptionText
              title={<span className="text-bad">{LOGOUT_LABEL}</span>}
              sub="Volver a la pantalla de inicio de sesión"
            />
          </button>
        </Section>
        <VersionChip className="min-h-touch border border-border bg-surface px-4 dsk:px-5" />
      </PageBody>
    </div>
  )
}
