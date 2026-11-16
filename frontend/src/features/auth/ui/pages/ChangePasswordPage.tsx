import { useState, type SyntheticEvent } from 'react'
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { paths } from '@/app/routes'
import { newPasswordSchema } from '@/features/auth/domain/credentials'
import { useChangePassword, useRequiredSession } from '@/features/auth/ui/hooks'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { Input } from '@/shared/ui/components/shadcn/input'
import { Label } from '@/shared/ui/components/shadcn/label'

type Field = 'current' | 'next' | 'confirm'
type Errors = Partial<Record<Field | 'form', string>>

const FIELDS: { name: Field; label: string; autoComplete: string }[] = [
  { name: 'current', label: 'Contraseña actual', autoComplete: 'current-password' },
  { name: 'next', label: 'Nueva contraseña', autoComplete: 'new-password' },
  { name: 'confirm', label: 'Repite la nueva contraseña', autoComplete: 'new-password' },
]

function PasswordForm({ onDone }: { onDone: () => void }) {
  const change = useChangePassword()
  const { seller } = useRequiredSession()
  const [errors, setErrors] = useState<Errors>({})
  const busy = change.isPending
  const [show, setShow] = useState(false)

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const parsed = newPasswordSchema(seller.username).safeParse(
      Object.fromEntries(FIELDS.map((f) => [f.name, (form.get(f.name) as string | null) ?? ''])),
    )
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error).fieldErrors
      setErrors({ current: flat.current?.[0], next: flat.next?.[0], confirm: flat.confirm?.[0] })
      return
    }
    setErrors({})
    try {
      await change.mutateAsync({ current: parsed.data.current, next: parsed.data.next })
      toast.success('Contraseña actualizada. Se cerraron tus sesiones en otros equipos.')
      onDone()
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.' })
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Cambiar contraseña" className="grid gap-4 p-4 dsk:p-5">
      {FIELDS.map((f) => (
        <div key={f.name} className="grid gap-1.5">
          <Label htmlFor={`pw-${f.name}`}>{f.label}</Label>
          <Input
            id={`pw-${f.name}`}
            name={f.name}
            type={show ? 'text' : 'password'}
            autoComplete={f.autoComplete}
            aria-invalid={!!errors[f.name]}
          />
          {errors[f.name] && <p className="text-sm font-medium text-bad">{errors[f.name]}</p>}
        </div>
      ))}
      <p className="text-sm text-muted-foreground">
        Al menos 8 caracteres, con letras y números. No uses tu usuario ni contraseñas obvias.
      </p>
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="flex min-h-touch w-fit items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline dsk:min-h-8"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        {show ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
      </button>
      {errors.form && (
        <p role="alert" className="rounded-md border border-bad-border bg-bad-soft px-3 py-2 text-sm text-foreground">
          {errors.form}
        </p>
      )}
      <Button type="submit" disabled={busy} className="dsk:justify-self-start">
        {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Guardar contraseña
      </Button>
    </form>
  )
}

/** Desde el perfil: cambio voluntario. */
export function ChangePasswordPage() {
  const navigate = useNavigate()
  return (
    <div>
      <PageHeader title="Cambiar contraseña" back={paths.profile} />
      <PageBody className="dsk:max-w-lg">
        <Section>
          <PasswordForm onDone={() => navigate(paths.profile)} />
        </Section>
      </PageBody>
    </div>
  )
}
