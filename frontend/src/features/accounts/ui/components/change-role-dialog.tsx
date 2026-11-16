import { useState } from 'react'
import { Loader2, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import type { AdminAccount } from '@/features/accounts/domain/accounts'
import type { Role } from '@/shared/domain/session'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog'
import { ROLE_LABEL } from '@/shared/types/roles'
import { CANCEL_LABEL } from '@/shared/types/labels'
import { useChangeRole, useRefreshAccounts } from '@/features/accounts/ui/hooks'
import { RolePicker } from '@/features/accounts/ui/components/role-picker'

/** Cambiar el rol de una cuenta (solo el supervisor general; el backend dice a qué roles). */
export function ChangeRoleDialog({ account, onClose }: { account: AdminAccount | null; onClose: () => void }) {
  const refresh = useRefreshAccounts()
  const [role, setRole] = useState<Role | null>(null)
  const change = useChangeRole()
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
      refresh()
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
            {CANCEL_LABEL}
          </Button>
          <Button type="button" onClick={save} disabled={unchanged || change.isPending}>
            {change.isPending ? <Loader2 className="animate-spin" /> : <UserCog />} Cambiar rol
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
