import { useState, type SyntheticEvent } from 'react'
import { CalendarRange } from 'lucide-react'
import { z } from 'zod'
import { diffDays } from '@/shared/domain/dates'
import { isoDateSchema } from '@/shared/domain/schemas'
import { checkPeriod, periodLimits, type Period } from '@/features/dashboards/domain/period'
import {
  APPLY_LABEL,
  CANCEL_LABEL,
  CUSTOM_PERIOD_TITLE,
  FROM_LABEL,
  MISSING_DATES_LABEL,
  PERIOD_ERROR,
  TO_LABEL,
  periodHint,
} from '@/features/dashboards/types/product-detail'
import { daysCount } from '@/shared/types/labels'
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

const rangeSchema = z.object({ from: isoDateSchema, to: isoDateSchema })

/** Modal para elegir un rango de fechas (limitado en largo y antigüedad). */
export function CustomPeriodDialog({
  open,
  onOpenChange,
  period,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  period: Period
  onApply: (from: string, to: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-[20px] sm:max-w-[420px]">
        {/* Se vuelve a montar en cada apertura: arranca con el período actual. */}
        {open && <RangeForm period={period} onApply={onApply} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function RangeForm({
  period,
  onApply,
  onCancel,
}: {
  period: Period
  onApply: (from: string, to: string) => void
  onCancel: () => void
}) {
  const { min, max } = periodLimits()
  const [from, setFrom] = useState(period.from)
  const [to, setTo] = useState(period.to)
  const parsed = rangeSchema.safeParse({ from, to })
  const problem = parsed.success ? checkPeriod(parsed.data.from, parsed.data.to) : 'missing'
  const message = problem === 'missing' ? MISSING_DATES_LABEL : problem ? PERIOD_ERROR[problem] : null

  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (parsed.success && !problem) onApply(parsed.data.from, parsed.data.to)
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader className="text-left">
        <DialogTitle className="flex items-center gap-2 text-[20px] font-extrabold">
          <CalendarRange className="size-5" /> {CUSTOM_PERIOD_TITLE}
        </DialogTitle>
        <DialogDescription>{periodHint(min, max)}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="period-from">{FROM_LABEL}</Label>
          <Input
            id="period-from"
            type="date"
            min={min}
            max={max}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-invalid={!!message}
            className="h-11"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="period-to">{TO_LABEL}</Label>
          <Input
            id="period-to"
            type="date"
            min={from || min}
            max={max}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-invalid={!!message}
            className="h-11"
          />
        </div>
      </div>
      {message ? (
        <p role="alert" className="text-[13px] font-semibold text-destructive">
          {message}
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground">{daysCount(diffDays(to, from) + 1)}</p>
      )}
      <DialogFooter className="flex-row gap-2 sm:justify-end">
        <Button type="button" variant="ghost" className="h-11 flex-1 font-bold sm:flex-none sm:px-6" onClick={onCancel}>
          {CANCEL_LABEL}
        </Button>
        <Button type="submit" disabled={!!message} className="h-11 flex-1 font-bold sm:flex-none sm:px-6">
          {APPLY_LABEL}
        </Button>
      </DialogFooter>
    </form>
  )
}
