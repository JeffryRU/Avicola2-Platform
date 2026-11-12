import { dShort, formatTime, hhmm } from '@/shared/domain/dates'
import { paths } from '@/app/routes'
import { dateOf, sortUnlocks, type Unlock } from '@/features/editing/domain/editing'
import {
  MY_REQUESTS_EMPTY,
  MY_REQUESTS_HINT,
  MY_REQUESTS_LIST_TITLE,
  MY_REQUESTS_SUBTITLE,
  MY_REQUESTS_TITLE,
  UNLOCK_STATUS_LABEL,
  decidedByLabel,
} from '@/features/editing/types/editing'
import { EditingDays } from '@/features/editing/ui/components/editing-days'
import { useUnlocks } from '@/features/editing/ui/hooks'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'

const STATUS_CLS: Record<Unlock['status'], string> = {
  requested: 'bg-warn-soft text-warn',
  approved: 'bg-ok-soft text-ok',
  rejected: 'bg-bad-soft text-destructive',
  closed: 'bg-muted text-ink-2',
}

/** Vendedor: pedir que le abran un día cerrado y ver qué pasó con lo que ya pidió. */
export function MyRequestsPage() {
  const unlocks = useUnlocks()
  const list = sortUnlocks(unlocks.data ?? [])
  return (
    <div>
      <PageHeader title={MY_REQUESTS_TITLE} subtitle={MY_REQUESTS_SUBTITLE} back={paths.home} />
      <PageBody>
        <div className="grid gap-4 @4xl/main:grid-cols-2 @4xl/main:items-start">
          <Section>
            <div className="px-4 pt-4 pb-4 dsk:px-5 dsk:pb-5">
              <EditingDays />
              <p className="mt-3 text-[13px] text-muted-foreground">{MY_REQUESTS_HINT}</p>
            </div>
          </Section>
          <Section title={MY_REQUESTS_LIST_TITLE} aside={<span className="text-muted-foreground">{list.length}</span>}>
            {unlocks.isPending ? null : list.length === 0 ? (
              <EmptyState title={MY_REQUESTS_EMPTY} />
            ) : (
              <ul className="grid gap-2 px-4 pb-4 dsk:px-5 dsk:pb-5">
                {list.map((u) => (
                  <li key={u.id} className="rounded-[14px] border-[1.5px] border-border px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="min-w-0 flex-1">{dShort(u.date)}</b>
                      <span className={cn('rounded-full px-2.5 py-1 text-[12.5px] font-bold', STATUS_CLS[u.status])}>
                        {UNLOCK_STATUS_LABEL[u.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-[14px] break-words text-ink-2">{u.reason}</p>
                    <small className="mt-1 block text-[12.5px] text-muted-foreground">
                      Pedida el {dShort(dateOf(u.requested_at))}, {formatTime(hhmm(u.requested_at))}
                      {u.decided_by && u.decided_at && ` · ${decidedByLabel(u.status, u.decided_by)}`}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </PageBody>
    </div>
  )
}
