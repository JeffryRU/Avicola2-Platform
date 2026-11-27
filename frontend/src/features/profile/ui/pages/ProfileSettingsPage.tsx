import { useState, type SyntheticEvent } from 'react'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { isSupervisor, roleLabel } from '@/shared/domain/session'
import { profileSchema } from '@/features/profile/domain/profile'
import { useRequiredSession, useUpdateProfile } from '@/features/auth'
import { Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { Input } from '@/shared/ui/components/shadcn/input'
import { Label } from '@/shared/ui/components/shadcn/label'
import { CANCEL_LABEL } from '@/shared/types/labels'

/** Datos de la cuenta (en «Mi cuenta»): el nombre lo edita cada persona; usuario, rol y zona son de solo lectura. */
export function ProfileForm() {
  const update = useUpdateProfile()
  const { seller } = useRequiredSession()
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
    if (parsed.data.name === seller.name) return
    try {
      await update.mutateAsync(parsed.data.name)
      toast.success('Perfil actualizado.')
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
    <Section title="Datos de perfil">
      <form
        key={seller.name}
        onSubmit={submit}
        onReset={() => setError(null)}
        noValidate
        aria-label="Datos de perfil"
        className="grid gap-4 p-4 dsk:p-5"
      >
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
          <Button type="reset" variant="ghost">
            {CANCEL_LABEL}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />} Guardar cambios
          </Button>
        </div>
      </form>
    </Section>
  )
}
