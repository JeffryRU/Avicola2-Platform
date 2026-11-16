import { KeyRound, Lock, LockOpen, Power, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import {
  accountState,
  otherRoles,
  type AccountState,
  type AdminAccount,
  type NewCredentials,
} from '@/features/accounts/domain/accounts'
import { useRequiredSession } from '@/features/auth'
import { ConfirmDialog } from '@/shared/ui/components/confirm-dialog'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'
import { ACCOUNT_STATE_LABEL } from '@/features/accounts/types/accounts'
import { roleName } from '@/shared/types/roles'
import { GRANT_LABEL, grantedLabel, REVOKE_LABEL, revokeDone, type Unlock, useRevokeEditing } from '@/features/editing'
import { useRefreshAccounts, useResetPassword, useSetActive } from '@/features/accounts/ui/hooks'

const STATE_CLS: Record<AccountState, string> = {
  active: 'bg-ok-soft text-ok',
  locked: 'bg-bad-soft text-destructive',
  inactive: 'bg-pend-soft text-slate-500',
}

function StateBadge({ state }: { state: AccountState }) {
  const label = ACCOUNT_STATE_LABEL[state]
  const cls = STATE_CLS[state]
  return <span className={cn('rounded-full px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap', cls)}>{label}</span>
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

export function AccountRow({
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
  const refresh = useRefreshAccounts()
  const reset = useResetPassword(account.username)
  const toggle = useSetActive(account.username, !account.is_active)
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
            description="Se genera una contraseña nueva para entregarle y se cierran sus sesiones abiertas. Si la cuenta estaba bloqueada, se desbloquea."
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
