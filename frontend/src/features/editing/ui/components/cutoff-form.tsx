import { useState, type SyntheticEvent } from 'react'
import { Clock, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { cutoffFormSchema, type Cutoff } from '@/features/editing/domain/editing'
import {
  CANCEL_LABEL,
  CUTOFF_TIME_LABEL,
  DAYS_BEFORE_LABEL,
  LOCK_LABEL,
  SAVE_LABEL,
  cutoffRule,
  daysBeforeLabel,
} from '@/features/editing/types/editing'
import { useUpdateCutoff } from '@/features/editing/ui/hooks'
import { Button } from '@/shared/ui/components/shadcn/button'
import { Input } from '@/shared/ui/components/shadcn/input'
import { Label } from '@/shared/ui/components/shadcn/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/components/shadcn/select'
import { Switch } from '@/shared/ui/components/shadcn/switch'
import { cn } from '@/shared/ui/lib/utils'

/** Supervisor: bloqueo por horario (encendido o apagado), hora de corte y con cuánta anticipación. */
export function CutoffForm({
  policy,
  idPrefix = 'cutoff',
  onSaved,
  onCancel,
  className,
}: {
  policy: Cutoff
  idPrefix?: string
  /** Tras guardar (p. ej., cerrar el modal). */
  onSaved?: () => void
  /** Con él aparece «Cancelar» junto a «Guardar». */
  onCancel?: () => void
  className?: string
}) {
  const update = useUpdateCutoff()
  const [enabled, setEnabled] = useState(policy.enabled)
  const [time, setTime] = useState(policy.cutoff_time)
  const [daysBefore, setDaysBefore] = useState(policy.days_before)
  const [error, setError] = useState<string | null>(null)
  const changed = time !== policy.cutoff_time || daysBefore !== policy.days_before || enabled !== policy.enabled

  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = cutoffFormSchema.safeParse({ cutoff_time: time, days_before: daysBefore, enabled })
    if (!parsed.success) {
      setError(z.flattenError(parsed.error).fieldErrors.cutoff_time?.[0] ?? 'Revisa la hora.')
      return
    }
    setError(null)
    update.mutate(
      { time: parsed.data.cutoff_time, daysBefore: parsed.data.days_before, enabled: parsed.data.enabled },
      {
        onSuccess: () => {
          toast.success(parsed.data.enabled ? 'Horario de corte guardado.' : 'Bloqueo por horario apagado.')
          onSaved?.()
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  return (
    <form onSubmit={submit} noValidate className={cn('grid gap-4 px-4 pt-3 pb-4 dsk:px-5 dsk:pb-5', className)}>
      <label
        htmlFor={`${idPrefix}-enabled`}
        className="flex min-h-touch cursor-pointer items-center gap-3 border-b border-rule pb-3"
      >
        <span className="flex-1 font-medium">{LOCK_LABEL}</span>
        <Switch id={`${idPrefix}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
      </label>
      <div className={cn('grid grid-cols-2 gap-3', !enabled && 'opacity-50')}>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-time`}>{CUTOFF_TIME_LABEL}</Label>
          <Input
            id={`${idPrefix}-time`}
            type="time"
            value={time}
            disabled={!enabled}
            onChange={(e) => setTime(e.target.value)}
            aria-invalid={!!error}
            className="num"
          />
        </div>
        <div className="grid gap-1.5">
          <Label id={`${idPrefix}-days-label`}>{DAYS_BEFORE_LABEL}</Label>
          <Select value={String(daysBefore)} onValueChange={(v) => setDaysBefore(Number(v))} disabled={!enabled}>
            <SelectTrigger aria-labelledby={`${idPrefix}-days-label`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {daysBeforeLabel(n)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="flex gap-2 rounded-md bg-muted p-3 text-sm text-ink-2">
        <Clock className="mt-0.5 size-4 flex-none text-muted-foreground" aria-hidden />
        {cutoffRule(time || policy.cutoff_time, daysBefore, enabled)}
      </p>
      {error && (
        <p role="alert" className="text-sm font-medium text-bad">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {CANCEL_LABEL}
          </Button>
        )}
        <Button type="submit" disabled={!changed || update.isPending}>
          {update.isPending ? <Loader2 className="animate-spin" /> : <Save />} {SAVE_LABEL}
        </Button>
      </div>
    </form>
  )
}
