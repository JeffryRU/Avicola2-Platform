import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { NewCredentials } from '@/features/accounts/domain/accounts'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog'

/** Muestra la contraseña inicial una sola vez, con botón para copiarla. */
export function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: NewCredentials | null
  onClose: () => void
}) {
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
          <DialogTitle>Contraseña inicial de {credentials?.account.name}</DialogTitle>
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
