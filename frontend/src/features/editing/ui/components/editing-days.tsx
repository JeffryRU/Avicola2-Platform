import { useState, type SyntheticEvent } from 'react'
import { CheckCircle2, Clock, Loader2, Lock, LockOpen, Send } from 'lucide-react'
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
import { cn } from '@/shared/ui/lib/utils'

/** Lista de los días que se pueden registrar: hasta cuándo, cerrados y su habilitación. */
export function EditingDays({ className }: { className?: string }) {
  const { data } = useEditingWindow()
  const [asking, setAsking] = useState<IsoDate | null>(null)
  if (!data) return null
  const now = today()
  return (
    <div className={className}>
      <span className="mb-2.5 block text-base font-bold">{EDITABLE_DAYS_TITLE}</span>
      <ul className="grid gap-2">
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
  const Icon = approved ? LockOpen : closed ? Lock : Clock
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border-[1.5px] px-3.5 py-2.5',
        closed ? 'border-border bg-muted/50' : 'border-border bg-white',
        approved && 'border-ok/40 bg-ok-soft/50',
      )}
    >
      <Icon className={cn('size-5 flex-none', closed ? 'text-faint' : approved ? 'text-ok' : 'text-primary')} />
      <div className="min-w-0 flex-1">
        <b className="block">{dShort(day.date)}</b>
        <small className="text-muted-foreground">
          {approved ? UNLOCK_STATUS_LABEL.approved : closesLabel(day.closes_at, day.open, now)}
        </small>
      </div>
      {closed && pending && (
        <span className="flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-[12.5px] font-bold text-warn">
          <Send className="size-3.5" /> {UNLOCK_STATUS_LABEL.requested}
        </span>
      )}
      {closed && !pending && (
        <Button type="button" variant="outline" size="sm" className="font-bold" onClick={onAsk}>
          {REQUEST_UNLOCK_LABEL}
        </Button>
      )}
      {approved && <CheckCircle2 className="size-5 text-ok" />}
    </li>
  )
}

/** Modal para pedir habilitación de un día cerrado, con el motivo. */
export function RequestDialog({ date, onClose }: { date: IsoDate | null; onClose: () => void }) {
  return (
    <Dialog open={date !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-[20px] sm:max-w-[440px]">
        {date && <RequestForm date={date} onDone={onClose} />}
      </DialogContent>
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
        <DialogTitle className="flex items-center gap-2 text-[20px] font-extrabold">
          <LockOpen className="size-5" /> {REQUEST_TITLE}
        </DialogTitle>
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
          className="w-full resize-none rounded-[12px] border-[1.5px] bg-white px-3 py-2.5 outline-none focus:border-primary focus:ring-4 focus:ring-primary-ring"
        />
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter className="flex-row gap-2 sm:justify-end">
        <Button type="button" variant="ghost" className="h-11 flex-1 font-bold sm:flex-none sm:px-6" onClick={onDone}>
          {CANCEL_LABEL}
        </Button>
        <Button type="submit" disabled={request.isPending} className="h-11 flex-1 font-bold sm:flex-none sm:px-6">
          {request.isPending ? <Loader2 className="animate-spin" /> : <Send />} {SEND_REQUEST_LABEL}
        </Button>
      </DialogFooter>
    </form>
  )
}
