import { useState } from 'react'
import { Loader2, LockOpen } from 'lucide-react'
import { toast } from 'sonner'
import { dShort, today, type IsoDate } from '@/shared/domain/dates'
import { defaultGrantDays, pastCutoff, type EditingWindow } from '@/features/editing/domain/editing'
import {
  CANCEL_LABEL,
  GRANT_DAYS_LABEL,
  GRANT_HINT,
  GRANT_LABEL,
  PAST_CUTOFF_LABEL,
  closesLabel,
  grantDone,
} from '@/features/editing/types/editing'
import { useGrantEditing } from '@/features/editing/ui/hooks'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog'
import { cn } from '@/shared/ui/lib/utils'
import { toggleIn } from '@/shared/domain/format'

/** Supervisor: elige los días que un vendedor podrá editar aunque haya pasado el corte. */
export function GrantEditingDialog({
  seller,
  window,
  onClose,
}: {
  seller: { username: string; name: string } | null
  window: EditingWindow | undefined
  onClose: () => void
}) {
  return (
    <Dialog open={!!seller && !!window} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {seller && window && <GrantForm key={seller.username} seller={seller} window={window} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function GrantForm({
  seller,
  window,
  onClose,
}: {
  seller: { username: string; name: string }
  window: EditingWindow
  onClose: () => void
}) {
  const grant = useGrantEditing()
  const [chosen, setChosen] = useState<IsoDate[]>(() => defaultGrantDays(window))
  const now = today()
  const toggle = (d: IsoDate) => setChosen((list) => toggleIn(list, d))
  const submit = () =>
    grant.mutate(
      { username: seller.username, dates: [...chosen].sort() },
      {
        onSuccess: () => {
          toast.success(grantDone(seller.name))
          onClose()
        },
        onError: (err) => toast.error(err.message),
      },
    )

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {GRANT_LABEL}: {seller.name}
        </DialogTitle>
        <DialogDescription>{GRANT_HINT}</DialogDescription>
      </DialogHeader>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">{GRANT_DAYS_LABEL}</legend>
        {window.days.map((d) => {
          const closed = pastCutoff(window, d)
          const checked = chosen.includes(d.date)
          return (
            <label
              key={d.date}
              className={cn(
                'flex min-h-touch cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 dsk:min-h-11',
                checked && 'border-primary bg-selected hc:border-foreground',
              )}
            >
              <input
                type="checkbox"
                className="size-4.5 accent-primary"
                checked={checked}
                onChange={() => toggle(d.date)}
              />
              {/* El día no se parte en dos líneas; si falta espacio, se ajusta la nota de cierre. */}
              <b className="flex-1 font-medium whitespace-nowrap">{dShort(d.date)}</b>
              <small
                className={cn('min-w-0 text-right text-sm', closed ? 'font-medium text-bad' : 'text-muted-foreground')}
              >
                {closed ? PAST_CUTOFF_LABEL : closesLabel(d.closes_at, true, now)}
              </small>
            </label>
          )
        })}
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {CANCEL_LABEL}
        </Button>
        <Button type="button" disabled={!chosen.length || grant.isPending} onClick={submit}>
          {grant.isPending ? <Loader2 className="animate-spin" /> : <LockOpen />} {GRANT_LABEL}
        </Button>
      </DialogFooter>
    </>
  )
}
