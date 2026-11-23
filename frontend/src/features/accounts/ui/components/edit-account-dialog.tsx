import { useState, type SyntheticEvent } from 'react'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { editAccountSchema, type AdminAccount } from '@/features/accounts/domain/accounts'
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
import { CANCEL_LABEL } from '@/shared/types/labels'
import { useEditAccount, useRefreshAccounts } from '@/features/accounts/ui/hooks'

type FormErrors = Partial<Record<'name' | 'zone' | 'form', string>>

/** Corregir el nombre y la zona de una cuenta. El usuario (login) queda fijo: es la llave de
 *  sus proyecciones, stock y avisos. El rol se cambia con su propio botón. */
export function EditAccountDialog({ account, onClose }: { account: AdminAccount | null; onClose: () => void }) {
  const refresh = useRefreshAccounts()
  const edit = useEditAccount()
  const [errors, setErrors] = useState<FormErrors>({})
  const close = () => {
    setErrors({})
    edit.reset()
    onClose()
  }

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!account) return
    const form = new FormData(e.currentTarget)
    const parsed = editAccountSchema.safeParse({ name: form.get('name') ?? '', zone: form.get('zone') ?? '' })
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error).fieldErrors
      setErrors({ name: flat.name?.[0], zone: flat.zone?.[0] })
      return
    }
    setErrors({})
    try {
      await edit.mutateAsync({ username: account.username, data: parsed.data })
      toast.success('Datos de la cuenta actualizados.')
      refresh()
      close()
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'No se pudo guardar.' })
    }
  }

  const field = (name: 'name' | 'zone', label: string, value: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`ea-${name}`}>{label}</Label>
      <Input id={`ea-${name}`} name={name} defaultValue={value} autoComplete="off" aria-invalid={!!errors[name]} />
      {errors[name] && <p className="text-sm font-medium text-bad">{errors[name]}</p>}
    </div>
  )

  return (
    <Dialog open={!!account} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>
            Corrige los datos de <b>{account?.username}</b>. El usuario no se puede cambiar.
          </DialogDescription>
        </DialogHeader>
        {account && (
          <form id="edit-account" onSubmit={submit} noValidate className="grid gap-3.5">
            {field('name', 'Nombre completo', account.name)}
            {field('zone', 'Zona (opcional)', account.zone ?? '')}
            {errors.form && (
              <p role="alert" className="text-sm font-medium text-bad">
                {errors.form}
              </p>
            )}
          </form>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {CANCEL_LABEL}
          </Button>
          <Button type="submit" form="edit-account" disabled={edit.isPending}>
            {edit.isPending ? <Loader2 className="animate-spin" /> : <Save />} Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
