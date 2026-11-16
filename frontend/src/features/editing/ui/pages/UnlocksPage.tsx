import { toast } from 'sonner'
import { dateOf, dShort, clockTime } from '@/shared/domain/dates'
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
} from '@/features/editing/types/editing'
import { useDecideUnlock, useEditingWindow, useUnlocks } from '@/features/editing/ui/hooks'
import { CutoffForm } from '@/features/editing/ui/components/cutoff-form'
import { useSellers } from '@/features/sellers'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { UnlockStatus } from '@/features/editing/ui/components/unlock-status'

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
        <div className="grid grid-cols-1 gap-4 @5xl/main:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] @5xl/main:items-start">
          <Section title={CUTOFF_TITLE}>{policy && <CutoffForm key={policyKey(policy)} policy={policy} />}</Section>
          <Section
            title={REQUESTS_TITLE}
            aside={
              <span>
                <span className="num">{list.filter((u) => u.status === 'requested').length}</span> por decidir
              </span>
            }
          >
            {unlocks.isPending ? null : list.length === 0 ? (
              <EmptyState title={NO_REQUESTS_LABEL} />
            ) : (
              <ul>
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
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-4 py-3 last:border-0 dsk:px-5">
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="font-medium">{name}</b>
          <span className="text-muted-foreground">· {dShort(unlock.date)}</span>
          <UnlockStatus status={unlock.status} />
        </div>
        <p className="mt-1 text-base">{unlock.reason}</p>
        <small className="text-xs text-muted-foreground">
          Pedida el {dShort(dateOf(unlock.requested_at))} a las {clockTime(unlock.requested_at)}
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
