import { useState, type SyntheticEvent } from 'react'
import { CheckCircle2, Loader2, Lock, LockOpen, Send } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { dShort, today, type IsoDate } from '@/shared/domain/dates'
import { unlockRequestSchema, type EditingDay } from '@/features/editing/domain/editing'
import {
  CANCEL_LABEL,
  EDITABLE_DAYS_TITLE,
  REASON_LABEL,
  REASON_PLACEHOLDER,
  REQUEST_TITLE,
  REQUEST_UNLOCK_LABEL,
  SEND_REQUEST_LABEL,
  UNLOCK_STATUS_LABEL,
  closesLabel,
  requestFor,
  requestSentLabel,
} from '@/features/editing/types/editing'
import { useEditingWindow, useRequestUnlock } from '@/features/editing/ui/hooks'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog'
import { Label } from '@/shared/ui/components/shadcn/label'
import { StatusDot } from '@/shared/ui/components/feedback'
import { cn } from '@/shared/ui/lib/utils'

/** Lista de los días que se pueden registrar: hasta cuándo, cerrados y su habilitación. */
export function EditingDays({ className }: { className?: string }) {
  const { data } = useEditingWindow()
  const [asking, setAsking] = useState<IsoDate | null>(null)
  if (!data) return null
  const now = today()
  return (
    <div className={className}>
      <span className="mb-2 block text-base font-semibold">{EDITABLE_DAYS_TITLE}</span>
      <ul className="border-t border-rule">
        {data.days.map((d) => (
          <DayRow key={d.date} day={d} today={now} onAsk={() => setAsking(d.date)} />
        ))}
      </ul>
      <RequestDialog date={asking} onClose={() => setAsking(null)} />
    </div>
  )
}

function DayRow({ day, today: now, onAsk }: { day: EditingDay; today: IsoDate; onAsk: () => void }) {
  const unlock = day.unlock
  const pending = unlock?.status === 'requested'
  const approved = unlock?.status === 'approved'
  const closed = !day.open
  // Solo los días cerrados o abiertos a pedido llevan ícono (candado); los normales, no.
  const Icon = approved ? LockOpen : closed ? Lock : null
  return (
    <li
      className={cn(
        'flex min-h-touch flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-1 py-2',
        closed && 'bg-muted',
      )}
    >
      {Icon && <Icon aria-hidden className={cn('size-4 flex-none', approved ? 'text-ok' : 'text-muted-foreground')} />}
      <div className="min-w-0 flex-1">
        <b className="block font-medium">{dShort(day.date)}</b>
        <small className="text-sm text-muted-foreground">
          {approved ? UNLOCK_STATUS_LABEL.approved : closesLabel(day.closes_at, day.open, now)}
        </small>
      </div>
      {closed && pending && (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-warn hc:font-bold">
          <StatusDot tone="warn" /> {UNLOCK_STATUS_LABEL.requested}
        </span>
      )}
      {closed && !pending && (
        <Button type="button" variant="outline" size="sm" onClick={onAsk}>
          {REQUEST_UNLOCK_LABEL}
        </Button>
      )}
      {approved && <CheckCircle2 aria-hidden className="size-4.5 text-ok" />}
    </li>
  )
}

/** Modal para pedir habilitación de un día cerrado, con el motivo. */
export function RequestDialog({ date, onClose }: { date: IsoDate | null; onClose: () => void }) {
  return (
    <Dialog open={date !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">{date && <RequestForm date={date} onDone={onClose} />}</DialogContent>
    </Dialog>
  )
}

function RequestForm({ date, onDone }: { date: IsoDate; onDone: () => void }) {
  const request = useRequestUnlock()
  const [error, setError] = useState<string | null>(null)

  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = unlockRequestSchema.safeParse({ date, reason: new FormData(e.currentTarget).get('reason') })
    if (!parsed.success) {
      setError(z.flattenError(parsed.error).fieldErrors.reason?.[0] ?? 'Revisa el motivo.')
      return
    }
    setError(null)
    request.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(requestSentLabel(date))
        onDone()
      },
      onError: (err) => setError(err.message),
    })
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader className="text-left">
        <DialogTitle className="text-xl font-semibold hc:font-extrabold">{REQUEST_TITLE}</DialogTitle>
        <DialogDescription>{requestFor(date)}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="unlock-reason">{REASON_LABEL}</Label>
        <textarea
          id="unlock-reason"
          name="reason"
          rows={3}
          maxLength={300}
          placeholder={REASON_PLACEHOLDER}
          aria-invalid={!!error}
          className="w-full resize-none rounded-md border-control border-input bg-surface px-3 py-2.5 text-md text-foreground placeholder:text-muted-foreground focus-visible:border-ring aria-invalid:border-bad dsk:text-base"
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-bad">
            {error}
          </p>
        )}
      </div>
      <DialogFooter className="flex-row gap-2 sm:justify-end">
        <Button type="button" variant="ghost" className="flex-1 sm:flex-none sm:px-6" onClick={onDone}>
          {CANCEL_LABEL}
        </Button>
        <Button type="submit" disabled={request.isPending} className="flex-1 sm:flex-none sm:px-6">
          {request.isPending ? <Loader2 className="animate-spin" /> : <Send />} {SEND_REQUEST_LABEL}
        </Button>
      </DialogFooter>
    </form>
  )
}
