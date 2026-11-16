import { useState, type SyntheticEvent } from 'react'
import { Loader2, Save } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { paths } from '@/app/routes'
import { initials } from '@/shared/domain/format'
import { isSupervisor, roleLabel } from '@/shared/domain/session'
import { profileSchema } from '@/features/profile/domain/profile'
import { useRequiredSession, useUpdateProfile } from '@/features/auth'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { Input } from '@/shared/ui/components/shadcn/input'
import { Label } from '@/shared/ui/components/shadcn/label'
import { CANCEL_LABEL } from '@/shared/types/labels'

/** Datos de la cuenta: el nombre lo edita cada persona; usuario, rol y zona son de solo lectura. */
export function ProfileSettingsPage() {
  const update = useUpdateProfile()
  const { seller } = useRequiredSession()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const busy = update.isPending

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = profileSchema.safeParse({ name: new FormData(e.currentTarget).get('name') })
    if (!parsed.success) {
      setError(z.flattenError(parsed.error).fieldErrors.name?.[0] ?? 'Revisa el nombre.')
      return
    }
    setError(null)
    if (parsed.data.name === seller.name) return void navigate(paths.profile)
    try {
      await update.mutateAsync(parsed.data.name)
      toast.success('Perfil actualizado.')
      void navigate(paths.profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el perfil.')
    }
  }

  const readOnly: [string, string][] = [
    ['Usuario', seller.username],
    ['Rol', roleLabel(seller).split(',')[0]],
    ...(isSupervisor(seller) ? [] : [['Zona', seller.zone ?? 'Sin zona asignada'] as [string, string]]),
  ]

  return (
    <div>
      <PageHeader title="Configuración de perfil" subtitle="Tu nombre y los datos de tu cuenta." back={paths.profile} />
      <PageBody className="dsk:max-w-xl">
        <Section>
          <form onSubmit={submit} noValidate aria-label="Configuración de perfil" className="grid gap-4 p-4 dsk:p-5">
            <div className="flex items-center gap-4">
              <div
                aria-hidden
                className="grid size-12 flex-none place-items-center rounded-full bg-selected text-md font-semibold text-selected-foreground"
              >
                {initials(seller.name)}
              </div>
              <p className="text-sm text-muted-foreground">
                Tus iniciales salen de tu nombre. Así te ve el resto del equipo en la app.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-name">Nombre</Label>
              <Input
                id="profile-name"
                name="name"
                defaultValue={seller.name}
                autoComplete="name"
                maxLength={100}
                aria-invalid={!!error}
              />
              {error && (
                <p role="alert" className="text-sm font-medium text-bad">
                  {error}
                </p>
              )}
            </div>
            <dl className="grid border-t border-rule pt-1 text-base">
              {readOnly.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-rule py-2.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
              <p className="pt-2.5 text-sm text-muted-foreground">
                El usuario no se puede cambiar. {isSupervisor(seller) ? '' : 'La zona la asigna tu supervisor.'}
              </p>
            </dl>
            <div className="flex flex-wrap justify-end gap-2.5">
              <Button type="button" variant="ghost" onClick={() => void navigate(paths.profile)}>
                {CANCEL_LABEL}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Save />} Guardar cambios
              </Button>
            </div>
          </form>
        </Section>
      </PageBody>
    </div>
  )
}
