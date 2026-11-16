import { useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import type { AdminAccount, NewCredentials } from '@/features/accounts/domain/accounts'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { activeUnlocks, GrantEditingDialog, useEditingWindow, useUnlocks } from '@/features/editing'
import { useAccounts, useRefreshAccounts } from '@/features/accounts/ui/hooks'
import { AccountRow } from '@/features/accounts/ui/components/account-row'
import { ChangeRoleDialog } from '@/features/accounts/ui/components/change-role-dialog'
import { CredentialsDialog } from '@/features/accounts/ui/components/credentials-dialog'
import { NewAccountDialog } from '@/features/accounts/ui/components/new-account-dialog'

/** Supervisores: alta de cuentas, recuperación de contraseña, desactivación, edición y roles.
 *  Qué cuentas puede tocar cada uno lo decide el backend (`can_manage`, `assignable_roles`). */
export function AccountsPage() {
  const refresh = useRefreshAccounts()
  const list = useAccounts()
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
          refresh()
        }}
      />
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  )
}
