import { toast } from 'sonner'
import { dShort, formatTime, hhmm } from '@/shared/domain/dates'
import { dateOf } from '@/features/editing/domain/editing'
import { paths } from '@/app/routes'
import { policyKey, sortUnlocks, type Unlock, type UnlockAction } from '@/features/editing/domain/editing'
import {
  CUTOFF_TITLE,
  NO_REQUESTS_LABEL,
  REQUESTS_TITLE,
  UNLOCKS_SUBTITLE,
  UNLOCKS_TITLE,
  UNLOCK_ACTION_DONE,
  UNLOCK_ACTION_LABEL,
  UNLOCK_STATUS_LABEL,
} from '@/features/editing/types/editing'
import { useDecideUnlock, useEditingWindow, useUnlocks } from '@/features/editing/ui/hooks'
import { CutoffForm } from '@/features/editing/ui/components/cutoff-form'
import { useSellers } from '@/features/dashboards/ui/hooks'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
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
