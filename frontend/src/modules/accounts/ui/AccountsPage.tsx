import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, KeyRound, Loader2, Lock, Power, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useContainer } from '@/app/di'
import {
  accountState,
  newAccountSchema,
  type AccountState,
  type AdminAccount,
  type NewCredentials,
} from '@/modules/accounts/domain/accounts'
import { useRequiredSession } from '@/modules/auth/ui/use-session'
import { ConfirmDialog } from '@/ui/components/confirm-dialog'
import { EmptyState } from '@/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/ui/components/layout'
import { Button } from '@/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/shadcn/dialog'
import { Input } from '@/ui/components/shadcn/input'
import { Label } from '@/ui/components/shadcn/label'
import { cn } from '@/ui/lib/utils'

const KEY = ['admin', 'accounts']

const STATE: Record<AccountState, [string, string]> = {
  active: ['Activa', 'bg-ok-soft text-ok'],
  must_change: ['Contraseña temporal', 'bg-warn-soft text-warn'],
  locked: ['Bloqueada', 'bg-bad-soft text-destructive'],
  inactive: ['Desactivada', 'bg-pend-soft text-slate-500'],
}

function StateBadge({ state }: { state: AccountState }) {
  const [label, cls] = STATE[state]
  return <span className={cn('rounded-full px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap', cls)}>{label}</span>
}

/** Muestra la contraseña temporal una sola vez, con botón para copiarla. */
function CredentialsDialog({ credentials, onClose }: { credentials: NewCredentials | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!credentials) return
    await navigator.clipboard.writeText(credentials.temporary_password)
    setCopied(true)
  }
  return (
    <Dialog
      open={!!credentials}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false)
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contraseña temporal de {credentials?.account.name}</DialogTitle>
          <DialogDescription>
            Entrégasela en persona. Se muestra solo esta vez: al entrar, {credentials?.account.username} tendrá que
            elegir una nueva.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-xl bg-muted p-3">
          <code className="flex-1 text-lg font-bold tracking-wider">{credentials?.temporary_password}</code>
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? 'Copiada' : 'Copiar'}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type FormErrors = Partial<Record<'username' | 'name' | 'zone' | 'form', string>>

function NewAccountDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (c: NewCredentials) => void
}) {
  const { accounts } = useContainer()
  const [errors, setErrors] = useState<FormErrors>({})
  const create = useMutation({ mutationFn: accounts.create })

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const parsed = newAccountSchema.safeParse({
      username: form.get('username') ?? '',
      name: form.get('name') ?? '',
      zone: form.get('zone') ?? '',
      role: form.get('supervisor') === 'on' ? 'supervisor' : 'seller',
    })
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error).fieldErrors
      setErrors({ username: flat.username?.[0], name: flat.name?.[0], zone: flat.zone?.[0] })
      return
    }
    setErrors({})
    try {
      onCreated(await create.mutateAsync(parsed.data))
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'No se pudo crear la cuenta.' })
    }
  }

  const field = (name: 'username' | 'name' | 'zone', label: string, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`na-${name}`}>{label}</Label>
      <Input id={`na-${name}`} name={name} autoComplete="off" aria-invalid={!!errors[name]} className="h-11" />
      {errors[name] ? (
        <p className="text-[13px] font-semibold text-destructive">{errors[name]}</p>
      ) : (
        hint && <p className="text-[13px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>Se genera una contraseña temporal que deberá cambiar al entrar.</DialogDescription>
        </DialogHeader>
        <form id="new-account" onSubmit={submit} noValidate className="grid gap-3.5">
          {field('username', 'Usuario', 'Minúsculas, sin espacios. Ej.: ltorres')}
          {field('name', 'Nombre completo')}
          {field('zone', 'Zona (opcional)')}
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="supervisor" className="size-[18px] accent-primary" /> Es supervisor (administra
            cuentas y ve a todos los vendedores)
          </label>
          {errors.form && (
            <p role="alert" className="text-[13px] font-semibold text-destructive">
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

function AccountRow({ account, onCredentials }: { account: AdminAccount; onCredentials: (c: NewCredentials) => void }) {
  const { accounts } = useContainer()
  const client = useQueryClient()
  const refresh = () => client.invalidateQueries({ queryKey: KEY })
  const reset = useMutation({ mutationFn: () => accounts.resetPassword(account.username) })
  const toggle = useMutation({ mutationFn: () => accounts.setActive(account.username, !account.is_active) })
  const state = accountState(account, new Date())
  // La propia cuenta se gestiona desde Perfil (cambiar contraseña), no aquí.
  const own = account.username === useRequiredSession().seller.username

  const doReset = async () => {
    try {
      onCredentials(await reset.mutateAsync())
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo restablecer.')
    }
  }
  const doToggle = async () => {
    try {
      await toggle.mutateAsync()
      toast.success(account.is_active ? 'Cuenta desactivada.' : 'Cuenta activada.')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar.')
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-muted px-4 py-3.5 last:border-0 dsk:px-5">
      <div className="min-w-0 flex-[1_1_200px]">
        <b className="block">
          {account.name} {account.role === 'supervisor' && <small className="text-primary">· Supervisor</small>}
        </b>
        <small className="text-muted-foreground">
          {account.username}
          {account.zone ? ` · ${account.zone}` : ''}
        </small>
      </div>
      <StateBadge state={state} />
      {own ? (
        <small className="font-semibold text-muted-foreground">Tu cuenta</small>
      ) : (
        <div className="flex gap-2">
          <ConfirmDialog
            title={`¿Restablecer la contraseña de ${account.name}?`}
            description="Se genera una contraseña temporal para entregarle y se cierran sus sesiones abiertas. Si la cuenta estaba bloqueada, se desbloquea."
            confirmLabel="Restablecer"
            onConfirm={doReset}
            trigger={(open) => (
              <Button type="button" variant="outline" size="sm" onClick={open}>
                {state === 'locked' ? <Lock /> : <KeyRound />} Restablecer
              </Button>
            )}
          />
          {account.is_active ? (
            <ConfirmDialog
              title={`¿Desactivar a ${account.name}?`}
              description="No podrá entrar hasta que reactives su cuenta, y se cierran sus sesiones abiertas."
              confirmLabel="Desactivar"
              destructive
              onConfirm={doToggle}
              trigger={(open) => (
                <Button type="button" variant="outline" size="sm" onClick={open}>
                  <Power /> Desactivar
                </Button>
              )}
            />
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={doToggle} disabled={toggle.isPending}>
              <Power /> Activar
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/** Supervisor: alta de vendedores, recuperación de contraseña y desactivación. */
export function AccountsPage() {
  const { accounts } = useContainer()
  const client = useQueryClient()
  const list = useQuery({ queryKey: KEY, queryFn: accounts.list })
  const [creating, setCreating] = useState(false)
  const [credentials, setCredentials] = useState<NewCredentials | null>(null)

  const newButton = (
    <Button type="button" onClick={() => setCreating(true)}>
      <UserPlus /> Nuevo usuario
    </Button>
  )
  return (
    <div>
      <PageHeader
        title="Usuarios"
        subtitle="Crea cuentas, restablece contraseñas olvidadas y desactiva accesos."
        actions={newButton}
        mobileActions={
          <Button type="button" size="icon" aria-label="Nuevo usuario" onClick={() => setCreating(true)}>
            <UserPlus />
          </Button>
        }
      />
      <PageBody className="dsk:max-w-[880px]">
        <Section>
          {list.isPending ? (
            <div className="grid place-items-center p-10">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : list.isError ? (
            <EmptyState title="No se pudo cargar">{list.error.message}</EmptyState>
          ) : (
            <ul>
              {list.data.map((a) => (
                <AccountRow key={a.username} account={a} onCredentials={setCredentials} />
              ))}
            </ul>
          )}
        </Section>
      </PageBody>
      <NewAccountDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(c) => {
          setCreating(false)
          setCredentials(c)
          client.invalidateQueries({ queryKey: KEY })
        }}
      />
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  )
}
