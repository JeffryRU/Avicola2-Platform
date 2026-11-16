import { useState, type SyntheticEvent } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { z } from 'zod'
import { newAccountSchema, type NewCredentials } from '@/features/accounts/domain/accounts'
import type { Role } from '@/shared/domain/session'
import { useRequiredSession } from '@/features/auth'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog'
import { Input } from '@/shared/ui/components/shadcn/input'
import { Label } from '@/shared/ui/components/shadcn/label'
import { useCreateAccount } from '@/features/accounts/ui/hooks'
import { RolePicker } from '@/features/accounts/ui/components/role-picker'

type FormErrors = Partial<Record<'username' | 'name' | 'zone' | 'form', string>>

export function NewAccountDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (c: NewCredentials) => void
}) {
  // Roles que esta persona puede crear (el supervisor, solo vendedores): lo decide el backend.
  const roles = useRequiredSession().manageable_roles
  const [role, setRole] = useState<Role>('seller')
  const [errors, setErrors] = useState<FormErrors>({})
  const create = useCreateAccount()

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const parsed = newAccountSchema.safeParse({
      username: form.get('username') ?? '',
      name: form.get('name') ?? '',
      zone: form.get('zone') ?? '',
      role,
    })
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error).fieldErrors
      setErrors({ username: flat.username?.[0], name: flat.name?.[0], zone: flat.zone?.[0] })
      return
    }
    setErrors({})
    try {
      onCreated(await create.mutateAsync(parsed.data))
      setRole('seller')
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'No se pudo crear la cuenta.' })
    }
  }

  const field = (name: 'username' | 'name' | 'zone', label: string, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`na-${name}`}>{label}</Label>
      <Input id={`na-${name}`} name={name} autoComplete="off" aria-invalid={!!errors[name]} />
      {errors[name] ? (
        <p className="text-sm font-medium text-bad">{errors[name]}</p>
      ) : (
        hint && <p className="text-sm text-muted-foreground">{hint}</p>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>
            Se genera una contraseña inicial para entregarle. Puede cambiarla cuando quiera desde su perfil.
          </DialogDescription>
        </DialogHeader>
        <form id="new-account" onSubmit={submit} noValidate className="grid gap-3.5">
          {field('username', 'Usuario', 'Minúsculas, sin espacios. Ej.: ltorres')}
          {field('name', 'Nombre completo')}
          {field('zone', 'Zona (opcional)')}
          {roles.length > 1 && <RolePicker name="na-role" roles={roles} value={role} onChange={setRole} />}
          {errors.form && (
            <p role="alert" className="text-sm font-medium text-bad">
              {errors.form}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button type="submit" form="new-account" disabled={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Crear usuario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
