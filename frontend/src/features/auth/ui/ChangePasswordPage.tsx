import { useState, type SyntheticEvent } from 'react'
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { useContainer } from '@/app/di'
import { paths } from '@/app/routes'
import { newPasswordSchema } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
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
  const { auth } = useContainer()
  const { seller } = useRequiredSession()
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
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
    setBusy(true)
    try {
      await auth.changePassword(parsed.data.current, parsed.data.next)
      toast.success('Contraseña actualizada. Se cerraron tus sesiones en otros equipos.')
      onDone()
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Cambiar contraseña" className="grid gap-3.5 p-5">
      {FIELDS.map((f) => (
        <div key={f.name} className="grid gap-1.5">
          <Label htmlFor={`pw-${f.name}`}>{f.label}</Label>
          <Input
            id={`pw-${f.name}`}
            name={f.name}
            type={show ? 'text' : 'password'}
            autoComplete={f.autoComplete}
            aria-invalid={!!errors[f.name]}
            className="h-11"
          />
          {errors[f.name] && <p className="text-[13px] font-semibold text-destructive">{errors[f.name]}</p>}
        </div>
      ))}
      <p className="text-[13px] text-muted-foreground">
        Al menos 8 caracteres, con letras y números. No uses tu usuario ni contraseñas obvias.
      </p>
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="flex w-fit items-center gap-2 text-sm font-semibold text-primary"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        {show ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
      </button>
      {errors.form && (
        <p role="alert" className="text-[13px] font-semibold text-destructive">
          {errors.form}
        </p>
      )}
      <Button type="submit" disabled={busy} className="h-11">
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
      <PageBody className="dsk:max-w-[520px]">
        <Section>
          <PasswordForm onDone={() => navigate(paths.profile)} />
        </Section>
      </PageBody>
    </div>
  )
}

/** Con contraseña temporal (la dio el supervisor): no se puede usar la app hasta cambiarla. */
export function ForcedPasswordChange() {
  const { auth } = useContainer()
  const { seller } = useRequiredSession()
  return (
    <div className="flex min-h-dvh items-start justify-center bg-background px-4 pt-16 pb-8">
      <div className="w-full max-w-[440px] rounded-3xl bg-card shadow-sheet">
        <div className="px-5 pt-6">
          <h1 className="text-2xl font-extrabold">Crea tu contraseña</h1>
          <p className="mt-1 text-ink-2">
            Hola, {seller.name}. Entraste con una contraseña temporal: elige una nueva para continuar.
          </p>
        </div>
        <PasswordForm onDone={() => {}} />
        <div className="border-t px-5 py-3 text-center">
          <button type="button" onClick={auth.logout} className="text-sm font-semibold text-muted-foreground">
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
