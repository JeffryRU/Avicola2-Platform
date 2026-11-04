import { useState, type SyntheticEvent } from 'react'
import { Loader2, Save } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { useContainer } from '@/app/di'
import { paths } from '@/app/routes'
import { initials } from '@/shared/domain/format'
import { isSupervisor, profileSchema, roleLabel } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { Input } from '@/shared/ui/components/shadcn/input'
import { Label } from '@/shared/ui/components/shadcn/label'

/** Datos de la cuenta: el nombre lo edita cada persona; usuario, rol y zona son de solo lectura. */
export function ProfileSettingsPage() {
  const { auth } = useContainer()
  const { seller } = useRequiredSession()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = profileSchema.safeParse({ name: new FormData(e.currentTarget).get('name') })
    if (!parsed.success) {
      setError(z.flattenError(parsed.error).fieldErrors.name?.[0] ?? 'Revisa el nombre.')
      return
    }
    setError(null)
    if (parsed.data.name === seller.name) return void navigate(paths.profile)
    setBusy(true)
    try {
      await auth.updateProfile(parsed.data.name)
      toast.success('Perfil actualizado.')
      void navigate(paths.profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el perfil.')
    } finally {
      setBusy(false)
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
      <PageBody className="dsk:max-w-[560px]">
        <Section>
          <form onSubmit={submit} noValidate aria-label="Configuración de perfil" className="grid gap-4 p-5">
            <div className="flex items-center gap-4">
              <div className="grid size-14 flex-none place-items-center rounded-full bg-secondary text-lg font-extrabold text-primary">
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
                className="h-11"
              />
              {error && (
                <p role="alert" className="text-[13px] font-semibold text-destructive">
                  {error}
                </p>
              )}
            </div>
            <dl className="grid gap-2.5 rounded-[14px] bg-muted/60 p-4 text-sm">
              {readOnly.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-semibold">{value}</dd>
                </div>
              ))}
              <p className="text-[12.5px] text-muted-foreground">
                El usuario no se puede cambiar. {isSupervisor(seller) ? '' : 'La zona la asigna tu supervisor.'}
              </p>
            </dl>
            <div className="flex flex-wrap justify-end gap-2.5">
              <Button
                type="button"
                variant="ghost"
                className="h-11 font-bold"
                onClick={() => void navigate(paths.profile)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy} className="h-11 font-bold">
                {busy ? <Loader2 className="animate-spin" /> : <Save />} Guardar cambios
              </Button>
            </div>
          </form>
        </Section>
      </PageBody>
    </div>
  )
}
