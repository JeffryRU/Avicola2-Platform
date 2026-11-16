import { dateOf, dShort, clockTime } from '@/shared/domain/dates'
import { paths } from '@/app/routes'
import { sortUnlocks } from '@/features/editing/domain/editing'
import {
  MY_REQUESTS_EMPTY,
  MY_REQUESTS_HINT,
  MY_REQUESTS_LIST_TITLE,
  MY_REQUESTS_SUBTITLE,
  MY_REQUESTS_TITLE,
  decidedByLabel,
} from '@/features/editing/types/editing'
import { EditingDays } from '@/features/editing/ui/components/editing-days'
import { useUnlocks } from '@/features/editing/ui/hooks'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { UnlockStatus } from '@/features/editing/ui/components/unlock-status'

/** Vendedor: pedir que le abran un día cerrado y ver qué pasó con lo que ya pidió. */
export function MyRequestsPage() {
  const unlocks = useUnlocks()
  const list = sortUnlocks(unlocks.data ?? [])
  return (
    <div>
      <PageHeader title={MY_REQUESTS_TITLE} subtitle={MY_REQUESTS_SUBTITLE} back={paths.home} />
      <PageBody>
        <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-2 @4xl/main:items-start">
          <Section>
            <div className="px-4 pt-4 pb-4 dsk:px-5 dsk:pb-5">
              <EditingDays />
              <p className="mt-3 text-sm text-muted-foreground">{MY_REQUESTS_HINT}</p>
            </div>
          </Section>
          <Section title={MY_REQUESTS_LIST_TITLE} aside={<span className="num">{list.length}</span>}>
            {unlocks.isPending ? null : list.length === 0 ? (
              <EmptyState title={MY_REQUESTS_EMPTY} />
            ) : (
              <ul>
                {list.map((u) => (
                  <li key={u.id} className="border-b border-rule px-4 py-3 last:border-0 dsk:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="min-w-0 flex-1 font-medium">{dShort(u.date)}</b>
                      <UnlockStatus status={u.status} />
                    </div>
                    <p className="mt-1 text-base break-words text-ink-2">{u.reason}</p>
                    <small className="mt-1 block text-xs text-muted-foreground">
                      Pedida el {dShort(dateOf(u.requested_at))}, {clockTime(u.requested_at)}
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
