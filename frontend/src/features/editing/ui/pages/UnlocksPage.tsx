import { useState, type SyntheticEvent } from 'react'
import { Clock, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { dShort, formatTime, hhmm } from '@/shared/domain/dates'
import { dateOf } from '@/features/editing/domain/editing'
import { paths } from '@/app/routes'
import {
  cutoffFormSchema,
  sortUnlocks,
  type Cutoff,
  type Unlock,
  type UnlockAction,
} from '@/features/editing/domain/editing'
import {
  CUTOFF_TIME_LABEL,
  CUTOFF_TITLE,
  DAYS_BEFORE_LABEL,
  NO_REQUESTS_LABEL,
  REQUESTS_TITLE,
  SAVE_LABEL,
  UNLOCKS_SUBTITLE,
  UNLOCKS_TITLE,
  UNLOCK_ACTION_DONE,
  UNLOCK_ACTION_LABEL,
  UNLOCK_STATUS_LABEL,
  cutoffRule,
  daysBeforeLabel,
} from '@/features/editing/types/editing'
import { useDecideUnlock, useEditingWindow, useUnlocks, useUpdateCutoff } from '@/features/editing/ui/hooks'
import { useSellers } from '@/features/dashboards/ui/hooks'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { Input } from '@/shared/ui/components/shadcn/input'
import { Label } from '@/shared/ui/components/shadcn/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/components/shadcn/select'
import { cn } from '@/shared/ui/lib/utils'

const STATUS_TONE: Record<Unlock['status'], string> = {
  requested: 'bg-warn-soft text-warn',
  approved: 'bg-ok-soft text-ok',
  rejected: 'bg-bad-soft text-destructive',
  closed: 'bg-muted text-ink-2',
}

/** Supervisor: horario de corte y solicitudes de habilitación de los vendedores. */
export function UnlocksPage() {
  const policy = useEditingWindow().data?.policy
  const unlocks = useUnlocks()
  const names = new Map((useSellers().data ?? []).map((s) => [s.username, s.name]))
  const list = sortUnlocks(unlocks.data ?? [])

  return (
    <div>
      <PageHeader title={UNLOCKS_TITLE} subtitle={UNLOCKS_SUBTITLE} back={paths.home} />
      <PageBody>
        <div className="grid gap-4 @5xl/main:grid-cols-[minmax(0,380px)_minmax(0,1fr)] @5xl/main:items-start">
          <Section title={CUTOFF_TITLE}>{policy && <CutoffForm key={policyKey(policy)} policy={policy} />}</Section>
          <Section
            title={REQUESTS_TITLE}
            aside={<span className="text-muted-foreground">{list.filter((u) => u.status === 'requested').length}</span>}
          >
            {unlocks.isPending ? null : list.length === 0 ? (
              <EmptyState title={NO_REQUESTS_LABEL} />
            ) : (
              <ul className="grid gap-2 px-4 pb-4 dsk:px-5 dsk:pb-5">
                {list.map((u) => (
                  <UnlockRow key={u.id} unlock={u} name={names.get(u.seller) ?? u.seller} />
                ))}
              </ul>
            )}
          </Section>
        </div>
      </PageBody>
    </div>
  )
}

const policyKey = (p: Cutoff) => `${p.cutoff_time}|${String(p.days_before)}`

function CutoffForm({ policy }: { policy: Cutoff }) {
  const update = useUpdateCutoff()
  const [time, setTime] = useState(policy.cutoff_time)
  const [daysBefore, setDaysBefore] = useState(policy.days_before)
  const [error, setError] = useState<string | null>(null)
  const changed = time !== policy.cutoff_time || daysBefore !== policy.days_before

  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = cutoffFormSchema.safeParse({ cutoff_time: time, days_before: daysBefore })
    if (!parsed.success) {
      setError(z.flattenError(parsed.error).fieldErrors.cutoff_time?.[0] ?? 'Revisa la hora.')
      return
    }
    setError(null)
    update.mutate(
      { time: parsed.data.cutoff_time, daysBefore: parsed.data.days_before },
      {
        onSuccess: () => toast.success('Horario de corte guardado.'),
        onError: (err) => setError(err.message),
      },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 px-4 pb-4 dsk:px-5 dsk:pb-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cutoff-time">{CUTOFF_TIME_LABEL}</Label>
          <Input
            id="cutoff-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-invalid={!!error}
            className="h-11"
          />
        </div>
        <div className="grid gap-1.5">
          <Label id="cutoff-days-label">{DAYS_BEFORE_LABEL}</Label>
          <Select value={String(daysBefore)} onValueChange={(v) => setDaysBefore(Number(v))}>
            <SelectTrigger aria-labelledby="cutoff-days-label" className="!h-11 w-full bg-white font-semibold">
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
      <p className="flex gap-2 rounded-[12px] bg-muted/60 p-3 text-[13.5px] text-ink-2">
        <Clock className="mt-0.5 size-4 flex-none" />
        {cutoffRule(time || policy.cutoff_time, daysBefore)}
      </p>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={!changed || update.isPending} className="h-11 font-bold">
          {update.isPending ? <Loader2 className="animate-spin" /> : <Save />} {SAVE_LABEL}
        </Button>
      </div>
    </form>
  )
}

function UnlockRow({ unlock, name }: { unlock: Unlock; name: string }) {
  const decide = useDecideUnlock()
  const act = (action: UnlockAction) =>
    decide.mutate(
      { id: unlock.id, action },
      {
        onSuccess: () => toast.success(UNLOCK_ACTION_DONE[action]),
        onError: (err) => toast.error(err.message),
      },
    )
  const actions: UnlockAction[] =
    unlock.status === 'requested' ? ['reject', 'approve'] : unlock.status === 'approved' ? ['close'] : []
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border-[1.5px] border-border bg-white px-3.5 py-3">
      <div className="min-w-0 flex-1 basis-[14rem]">
        <div className="flex flex-wrap items-center gap-2">
          <b>{name}</b>
          <span className="text-muted-foreground">· {dShort(unlock.date)}</span>
          <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-bold', STATUS_TONE[unlock.status])}>
            {UNLOCK_STATUS_LABEL[unlock.status]}
          </span>
        </div>
        <p className="mt-1 text-[14px]">{unlock.reason}</p>
        <small className="text-muted-foreground">
          Pedida el {dShort(dateOf(unlock.requested_at))} a las {formatTime(hhmm(unlock.requested_at))}
        </small>
      </div>
      {actions.length > 0 && (
        <div className="flex gap-2">
          {actions.map((a) => (
            <Button
              key={a}
              type="button"
              size="sm"
              variant={a === 'approve' ? 'default' : 'outline'}
              disabled={decide.isPending}
              className="font-bold"
              onClick={() => act(a)}
            >
              {UNLOCK_ACTION_LABEL[a]}
            </Button>
          ))}
        </div>
      )}
    </li>
  )
}
