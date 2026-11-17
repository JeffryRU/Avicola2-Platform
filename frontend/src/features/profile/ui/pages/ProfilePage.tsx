import { useId, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { InstallOption } from '@/app/install'
import { paths } from '@/app/routes'
import { contrastFromSwitch, type ThemePreference } from '@/shared/domain/appearance'
import { can, hasTeamView } from '@/shared/domain/session'
import { useLogout, useRequiredSession } from '@/features/auth'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Segmented } from '@/shared/ui/components/segmented'
import { Switch } from '@/shared/ui/components/shadcn/switch'
import { AccentSwatches } from '@/shared/ui/components/accent-picker'
import { AccessibilityOptions } from '@/shared/ui/components/accessibility-options'
import { A11Y_LABEL, ACCENT_LABEL, HIGH_CONTRAST_HINT, HIGH_CONTRAST_LABEL } from '@/shared/types/appearance'
import { useAppearance } from '@/shared/ui/hooks/use-appearance'
import { cn } from '@/shared/ui/lib/utils'
import { VersionChip } from '@/features/versions'
import { ProfileForm } from '@/features/profile/ui/pages/ProfileSettingsPage'
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

/** Una fila de ajuste: título y ayuda arriba, el control debajo. */
function Field({ title, hint, children }: { title: string; hint: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-2.5 border-b border-rule px-4 py-4 last:border-0 dsk:px-5">
      <div>
        <b className="block font-medium">{title}</b>
        <small className="block text-sm text-muted-foreground">{hint}</small>
      </div>
      {children}
    </div>
  )
}

/** Mi cuenta: tus datos, tus herramientas (en celular, donde no hay menú lateral) y esta app. */
export function ProfilePage() {
  const logout = useLogout()
  const session = useRequiredSession()
  // El jefe de despacho no proyecta: no tiene historial de proyecciones.
  const projects = hasTeamView(session) || !can(session, 'view_stock')
  const tools: ReactNode[] = []
  if (can(session, 'manage_editing'))
    tools.push(
      <Option key="u" to={paths.unlocks} title="Habilitaciones" sub="Horario de corte y solicitudes de edición" />,
    )
  if (can(session, 'view_saca'))
    tools.push(<Option key="s" to={paths.saca} title="Cálculo de saca" sub="Cuánto pedir a granja cada día" />)
  if (hasTeamView(session) && can(session, 'view_stock'))
    tools.push(<Option key="t" to={paths.stock} title="Stock de despacho" sub="Lo que quedó en despacho cada día" />)
  if (projects)
    tools.push(
      <Option key="h" to={paths.history} title="Historial de cambios" sub="Quién creó o modificó cada proyección" />,
    )
  return (
    <div>
      <PageHeader title="Mi cuenta" back={null} />
      <PageBody className="grid gap-4">
        <ProfileForm />
        {/* En escritorio estas pantallas ya están en el menú lateral. */}
        {tools.length > 0 && (
          <Section title="Herramientas" className="dsk:hidden">
            {tools}
          </Section>
        )}
        <Section title="Esta app">
          <InstallOption className={optCls} />
          <VersionChip className="min-h-touch rounded-none border-b border-rule px-4 last:border-0 dsk:px-5" />
          {/* En celular no hay menú lateral: aquí está la única salida. */}
          <button type="button" className={cn(optCls, 'dsk:hidden')} onClick={() => logout.mutate()}>
            <OptionText
              title={<span className="text-bad">{LOGOUT_LABEL}</span>}
              sub="Volver a la pantalla de inicio de sesión"
            />
          </button>
        </Section>
      </PageBody>
    </div>
  )
}

/** Apariencia y accesibilidad: tema, color, alto contraste y las opciones de lectura. Se guardan en este equipo. */
export function AppearancePage() {
  const { preference, resolved, system, setPreference } = useAppearance()
  const contrastId = useId()
  const high = resolved.contrast === 'high'
  return (
    <div>
      <PageHeader title="Apariencia y accesibilidad" back={paths.profile} />
      <PageBody className="grid gap-4">
        <Section title="Apariencia">
          <Field
            title="Tema"
            hint={
              <>
                «Sistema» sigue el modo claro u oscuro de tu equipo
                {preference.theme === 'system' ? ` (ahora: ${system.prefersDark ? 'oscuro' : 'claro'})` : ''}.
              </>
            }
          >
            <Segmented
              value={preference.theme}
              options={THEME_OPTIONS}
              onChange={(theme) => setPreference({ ...preference, theme })}
              className="w-full dsk:max-w-md"
              full
            />
          </Field>
          <Field title={ACCENT_LABEL} hint="Botones, enlaces y selección. También desde el botón de paleta del menú.">
            <AccentSwatches />
          </Field>
          <div className="flex items-start gap-4 px-4 py-4 dsk:px-5">
            <label htmlFor={contrastId} className="min-w-0 flex-1 cursor-pointer">
              <b className="block font-medium">{HIGH_CONTRAST_LABEL}</b>
              <small className="block text-sm text-muted-foreground">
                {HIGH_CONTRAST_HINT}
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
        <Section title={A11Y_LABEL}>
          <AccessibilityOptions />
        </Section>
      </PageBody>
    </div>
  )
}
