import { useState, type SyntheticEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, KeyRound, Loader2, Lock, LockOpen, Power, UserCog, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useContainer } from '@/app/di'
import {
  accountState,
  newAccountSchema,
  otherRoles,
  type AccountState,
  type AdminAccount,
  type NewCredentials,
} from '@/features/accounts/domain/accounts'
import type { Role } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { ConfirmDialog } from '@/shared/ui/components/confirm-dialog'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
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
import { cn } from '@/shared/ui/lib/utils'
import { ACCOUNT_STATE_LABEL } from '@/features/accounts/types/accounts'
import { ROLE_HINT, ROLE_LABEL, roleName } from '@/features/auth/types/roles'
import { activeUnlocks, type Unlock } from '@/features/editing/domain/editing'
import { GRANT_LABEL, REVOKE_LABEL, grantedLabel, revokeDone } from '@/features/editing/types/editing'
import { useEditingWindow, useRevokeEditing, useUnlocks } from '@/features/editing/ui/hooks'
import { GrantEditingDialog } from '@/features/editing/ui/components/grant-editing'

const KEY = ['admin', 'accounts']

const STATE_CLS: Record<AccountState, string> = {
  active: 'bg-ok-soft text-ok',
  must_change: 'bg-warn-soft text-warn',
  locked: 'bg-bad-soft text-destructive',
  inactive: 'bg-pend-soft text-slate-500',
}

function StateBadge({ state }: { state: AccountState }) {
  const label = ACCOUNT_STATE_LABEL[state]
  const cls = STATE_CLS[state]
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

/** Elegir un rol entre los que el backend permite (con qué hace cada uno). */
function RolePicker({
  name,
  roles,
  value,
  onChange,
  current,
}: {
  name: string
  roles: Role[]
  value: Role
  onChange: (role: Role) => void
  /** Rol actual de la cuenta (se marca como tal). */
  current?: string
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-semibold">Rol</legend>
      {roles.map((role) => (
        <label
          key={role}
          className={cn(
            'flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors',
            value === role && 'border-primary bg-secondary',
          )}
        >
          <input
            type="radio"
            name={name}
            value={role}
            checked={value === role}
            onChange={() => onChange(role)}
            className="mt-0.5 size-[18px] accent-primary"
          />
          <span className="grid gap-0.5">
            <b className="text-sm">
              {ROLE_LABEL[role]}
              {role === current && <small className="font-semibold text-muted-foreground"> · actual</small>}
            </b>
            <small className="text-muted-foreground">{ROLE_HINT[role]}</small>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

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
  // Roles que esta persona puede crear (el supervisor, solo vendedores): lo decide el backend.
  const roles = useRequiredSession().manageable_roles
  const [role, setRole] = useState<Role>('seller')
  const [errors, setErrors] = useState<FormErrors>({})
  const create = useMutation({ mutationFn: (a: Parameters<typeof accounts.create>[0]) => accounts.create(a) })

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
          {roles.length > 1 && <RolePicker name="na-role" roles={roles} value={role} onChange={setRole} />}
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

/** Cambiar el rol de una cuenta (solo el supervisor general; el backend dice a qué roles). */
function ChangeRoleDialog({ account, onClose }: { account: AdminAccount | null; onClose: () => void }) {
  const { accounts } = useContainer()
  const client = useQueryClient()
  const [role, setRole] = useState<Role | null>(null)
  const change = useMutation({
    mutationFn: (next: { username: string; role: Role }) => accounts.changeRole(next.username, next.role),
  })
  const close = () => {
    setRole(null)
    change.reset()
    onClose()
  }
  // Si su rol actual no es uno que se pueda elegir, se parte del primero permitido.
  const current = account?.assignable_roles.find((r) => r === account.role)
  const selected: Role = role ?? current ?? account?.assignable_roles[0] ?? 'seller'
  const unchanged = !account || selected === account.role

  async function save() {
    if (!account || unchanged) return
    try {
      await change.mutateAsync({ username: account.username, role: selected })
      toast.success(`${account.name} ahora es ${ROLE_LABEL[selected].toLowerCase()}.`)
      void client.invalidateQueries({ queryKey: KEY })
      close()
    } catch {
      // El error se muestra en el diálogo.
    }
  }

  return (
    <Dialog open={!!account} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar el rol de {account?.name}</DialogTitle>
          <DialogDescription>
            Sus sesiones abiertas se cierran: al volver a entrar, verá la app según su nuevo rol.
          </DialogDescription>
        </DialogHeader>
        {account && (
          <RolePicker
            name="cr-role"
            roles={account.assignable_roles}
            value={selected}
            onChange={setRole}
            current={account.role}
          />
        )}
        {change.isError && (
          <p role="alert" className="text-[13px] font-semibold text-destructive">
            {change.error instanceof Error ? change.error.message : 'No se pudo cambiar el rol.'}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={unchanged || change.isPending}>
            {change.isPending ? <Loader2 className="animate-spin" /> : <UserCog />} Cambiar rol
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Habilitar o cerrar la edición de proyecciones de un vendedor (aunque haya pasado el corte). */
function EditingControl({
  account,
  granted,
  onGrant,
}: {
  account: AdminAccount
  granted: Unlock[]
  onGrant: () => void
}) {
  const revoke = useRevokeEditing()
  const doRevoke = async () => {
    try {
      await revoke.mutateAsync(account.username)
      toast.success(revokeDone(account.name))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cerrar la edición.')
    }
  }
  if (!granted.length) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={onGrant}>
        <LockOpen /> {GRANT_LABEL}
      </Button>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap text-ok">
        {grantedLabel(granted.map((u) => u.date))}
      </span>
      <ConfirmDialog
        title={`¿Cerrar la edición de ${account.name}?`}
        description="Volverá a regirse por la hora de corte. Le llega un aviso."
        confirmLabel={REVOKE_LABEL}
        onConfirm={doRevoke}
        trigger={(open) => (
          <Button type="button" variant="outline" size="sm" onClick={open} disabled={revoke.isPending}>
            <Lock /> {REVOKE_LABEL}
          </Button>
        )}
      />
    </span>
  )
}

function AccountRow({
  account,
  onCredentials,
  granted,
  onGrant,
  onChangeRole,
}: {
  account: AdminAccount
  onCredentials: (c: NewCredentials) => void
  /** Solo para vendedores activos: habilitaciones vigentes (vacía = ninguna). */
  granted?: Unlock[]
  onGrant: () => void
  onChangeRole: () => void
}) {
  const { accounts } = useContainer()
  const client = useQueryClient()
  const refresh = () => void client.invalidateQueries({ queryKey: KEY })
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
          {account.name}{' '}
          {account.role !== 'seller' && <small className="text-primary">· {roleName(account.role)}</small>}
        </b>
        <small className="text-muted-foreground">
          {account.username}
          {account.zone ? ` · ${account.zone}` : ''}
        </small>
      </div>
      <StateBadge state={state} />
      {own ? (
        <small className="font-semibold text-muted-foreground">Tu cuenta</small>
      ) : !account.can_manage ? (
        // Un supervisor no gestiona a otros supervisores: eso lo hace el supervisor general.
        <small className="font-semibold text-muted-foreground">Lo gestiona el supervisor general</small>
      ) : (
        <div className="flex flex-wrap gap-2">
          {granted && <EditingControl account={account} granted={granted} onGrant={onGrant} />}
          {otherRoles(account).length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={onChangeRole}>
              <UserCog /> Rol
            </Button>
          )}
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

/** Supervisores: alta de cuentas, recuperación de contraseña, desactivación, edición y roles.
 *  Qué cuentas puede tocar cada uno lo decide el backend (`can_manage`, `assignable_roles`). */
export function AccountsPage() {
  const { accounts } = useContainer()
  const client = useQueryClient()
  const list = useQuery({ queryKey: KEY, queryFn: () => accounts.list() })
  const [creating, setCreating] = useState(false)
  const [credentials, setCredentials] = useState<NewCredentials | null>(null)
  const [granting, setGranting] = useState<AdminAccount | null>(null)
  const [changingRole, setChangingRole] = useState<AdminAccount | null>(null)
  const editing = useEditingWindow().data
  const unlocks = useUnlocks().data ?? []
  const granted = editing ? activeUnlocks(unlocks, editing.days[0]?.date ?? '') : null
  const grantedFor = (a: AdminAccount) =>
    granted && a.is_active && a.role === 'seller' ? (granted.get(a.username) ?? []) : undefined

  const newButton = (
    <Button type="button" onClick={() => setCreating(true)}>
      <UserPlus /> Nuevo usuario
    </Button>
  )
  return (
    <div>
      <PageHeader
        title="Usuarios"
        subtitle="Crea cuentas, restablece contraseñas, desactiva accesos y habilita la edición de proyecciones."
        actions={newButton}
        mobileActions={
          <Button type="button" size="icon" aria-label="Nuevo usuario" onClick={() => setCreating(true)}>
            <UserPlus />
          </Button>
        }
      />
      <PageBody>
        <div className="grid gap-4">
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
                  <AccountRow
                    key={a.username}
                    account={a}
                    onCredentials={setCredentials}
                    granted={grantedFor(a)}
                    onGrant={() => setGranting(a)}
                    onChangeRole={() => setChangingRole(a)}
                  />
                ))}
              </ul>
            )}
          </Section>
        </div>
      </PageBody>
      <GrantEditingDialog seller={granting} window={editing} onClose={() => setGranting(null)} />
      <ChangeRoleDialog account={changingRole} onClose={() => setChangingRole(null)} />
      <NewAccountDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(c) => {
          setCreating(false)
          setCredentials(c)
          void client.invalidateQueries({ queryKey: KEY })
        }}
      />
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  )
}
