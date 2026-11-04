import { useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog'

interface Props {
  title: string
  description: ReactNode
  confirmLabel: string
  destructive?: boolean
  /** Acción al confirmar; el diálogo muestra "cargando" mientras dura y se cierra al terminar. */
  onConfirm: () => Promise<void> | void
  /** Botón que abre la confirmación. Recibe la función para abrirla. */
  trigger: (open: () => void) => ReactNode
}

/**
 * Confirmación dentro de la app. No se usa `window.confirm()`: algunos navegadores embebidos y
 * PWA instaladas bloquean los diálogos nativos y devuelven "Cancelar" sin mostrar nada.
 */
export function ConfirmDialog({ title, description, confirmLabel, destructive, onConfirm, trigger }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={confirm} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
