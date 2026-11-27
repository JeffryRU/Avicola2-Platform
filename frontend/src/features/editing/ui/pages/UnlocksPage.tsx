import { useState } from 'react'
import { Clock, Lock, LockOpen, Search, Settings2, X } from 'lucide-react'
import { toast } from 'sonner'
import { dShort, relativeDay } from '@/shared/domain/dates'
import { paths } from '@/app/routes'
import {
  NO_UNLOCK_FILTER,
  UNLOCK_STATUSES,
  countByStatus,
  filterUnlocks,
  groupByDay,
  policyKey,
  type Unlock,
  type UnlockAction,
  type UnlockFilter,
  type UnlockStatus as Status,
} from '@/features/editing/domain/editing'
import {
  ALL_SELLERS_LABEL,
  ALL_STATUSES_LABEL,
  CLEAR_FILTERS_LABEL,
  CONFIGURE_CUTOFF_LABEL,
  CUTOFF_DIALOG_HINT,
  CUTOFF_TITLE,
  DAY_FILTER_HINT,
  FROM_LABEL,
  LOCK_OFF_CHIP,
  LOCK_ON_CHIP,
  NO_MATCH_BODY,
  NO_MATCH_TITLE,
  NO_REQUESTS_LABEL,
  REQUESTS_TITLE,
  SEARCH_LABEL,
  SEARCH_PLACEHOLDER,
  SELLER_FILTER_LABEL,
  TO_LABEL,
  UNLOCKS_SUBTITLE,
  UNLOCKS_TITLE,
  UNLOCK_ACTION_DONE,
  UNLOCK_ACTION_LABEL,
  UNLOCK_STATUS_TAB,
  cutoffSummary,
  dayGroupLabel,
  decidedLabel,
  pendingAside,
  requestedAtLabel,
  statusTab,
} from '@/features/editing/types/editing'
import { useDecideUnlock, useEditingWindow, useUnlocks } from '@/features/editing/ui/hooks'
import { CutoffForm } from '@/features/editing/ui/components/cutoff-form'
import { useSellers } from '@/features/sellers'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Segmented } from '@/shared/ui/components/segmented'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/components/shadcn/dialog'
import { Input } from '@/shared/ui/components/shadcn/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/components/shadcn/select'
import { UNLOCK_STATUS_LABEL } from '@/features/editing/types/editing'
import type { Cutoff } from '@/features/editing/domain/editing'
import { cn } from '@/shared/ui/lib/utils'

const ALL = 'all'

/** Resumen del horario de corte y el botón que abre su configuración (modal). */
function CutoffButton({ policy }: { policy: Cutoff }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-h-control inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm">
        <Clock aria-hidden className="size-4 text-muted-foreground" />
        <span className="num font-medium">{cutoffSummary(policy.cutoff_time, policy.days_before, policy.enabled)}</span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold',
            policy.enabled ? 'bg-ok-fill text-ok-fill-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {policy.enabled ? <Lock aria-hidden className="size-3" /> : <LockOpen aria-hidden className="size-3" />}
          {policy.enabled ? LOCK_ON_CHIP : LOCK_OFF_CHIP}
        </span>
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline">
            <Settings2 aria-hidden /> {CONFIGURE_CUTOFF_LABEL}
          </Button>
        </DialogTrigger>
        <DialogContent className="gap-2 p-0 sm:max-w-md dsk:p-0">
          <div className="grid gap-1 px-5 pt-5 pr-14">
            <DialogTitle className="text-lg font-bold">{CUTOFF_TITLE}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{CUTOFF_DIALOG_HINT}</DialogDescription>
          </div>
          <CutoffForm
            key={policyKey(policy)}
            policy={policy}
            idPrefix="cutoff-dialog"
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
            className="dsk:px-5"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Supervisor: horario de corte (en un modal) y solicitudes de habilitación, con filtros. */
export function UnlocksPage() {
  const policy = useEditingWindow().data?.policy
  const unlocks = useUnlocks()
  const sellers = useSellers().data ?? []
  const names = new Map(sellers.map((s) => [s.username, s.name]))
  const name = (u: string) => names.get(u) ?? u
  const list = unlocks.data ?? []
  const pending = list.filter((u) => u.status === 'requested').length

  // Sin elegir estado: lo que pide acción si hay; si no, todas.
  const [filter, setFilter] = useState<UnlockFilter>(NO_UNLOCK_FILTER)
  const [statusTouched, setStatusTouched] = useState(false)
  const status: Status | null = statusTouched ? filter.status : pending > 0 ? 'requested' : null
  const set = (patch: Partial<UnlockFilter>) => setFilter((f) => ({ ...f, ...patch }))

  // Los contadores siguen al resto de filtros (vendedor, fechas, búsqueda).
  const base = filterUnlocks(list, { ...filter, status: null }, name)
  const counts = countByStatus(base)
  const shown = filterUnlocks(list, { ...filter, status }, name)
  const groups = groupByDay(shown)
  const filtered =
    Boolean(filter.seller ?? filter.from ?? filter.to) ||
    filter.text.trim() !== '' ||
    (statusTouched && status !== null)
  const sellersInList = [...new Set(list.map((u) => u.seller))].sort((a, b) => name(a).localeCompare(name(b)))
  const clear = () => {
    setFilter(NO_UNLOCK_FILTER)
    setStatusTouched(true)
  }

  return (
    <div>
      <PageHeader
        title={UNLOCKS_TITLE}
        subtitle={UNLOCKS_SUBTITLE}
        back={paths.home}
        actions={policy && <CutoffButton policy={policy} />}
      />
      <PageBody>
        {/* En el celular, el horario va arriba de la lista. */}
        {policy && (
          <div className="mb-3 dsk:hidden">
            <CutoffButton policy={policy} />
          </div>
        )}
        <Section title={REQUESTS_TITLE} aside={pendingAside(pending)}>
          <div className="grid grid-cols-1 gap-3 border-b border-rule px-4 py-3 dsk:px-5">
            <Segmented<Status | typeof ALL>
              value={status ?? ALL}
              onChange={(v) => {
                setStatusTouched(true)
                set({ status: v === ALL ? null : v })
              }}
              options={[
                ...UNLOCK_STATUSES.map((s) => ({ value: s, label: statusTab(UNLOCK_STATUS_TAB[s], counts[s]) })),
                { value: ALL, label: statusTab(ALL_STATUSES_LABEL, base.length) },
              ]}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 @4xl/main:grid-cols-[minmax(0,14rem)_auto_minmax(0,1fr)]">
              <div className="grid gap-1">
                <span id="unlock-seller" className="text-xs font-medium text-muted-foreground">
                  {SELLER_FILTER_LABEL}
                </span>
                <Select value={filter.seller ?? ALL} onValueChange={(v) => set({ seller: v === ALL ? null : v })}>
                  <SelectTrigger aria-labelledby="unlock-seller" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{ALL_SELLERS_LABEL}</SelectItem>
                    {sellersInList.map((s) => (
                      <SelectItem key={s} value={s}>
                        {name(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <fieldset className="grid min-w-0 gap-1">
                <legend className="mb-1 text-xs font-medium text-muted-foreground">{DAY_FILTER_HINT}</legend>
                <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
                  <Input
                    type="date"
                    aria-label={FROM_LABEL}
                    title={FROM_LABEL}
                    value={filter.from ?? ''}
                    max={filter.to ?? undefined}
                    onChange={(e) => set({ from: e.target.value || null })}
                    className="num sm:w-auto"
                  />
                  <span aria-hidden className="hidden text-muted-foreground sm:inline">
                    –
                  </span>
                  <Input
                    type="date"
                    aria-label={TO_LABEL}
                    title={TO_LABEL}
                    value={filter.to ?? ''}
                    min={filter.from ?? undefined}
                    onChange={(e) => set({ to: e.target.value || null })}
                    className="num sm:w-auto"
                  />
                </div>
              </fieldset>
              <div className="grid gap-1 sm:col-span-2 @4xl/main:col-span-1">
                <label htmlFor="unlock-search" className="text-xs font-medium text-muted-foreground">
                  {SEARCH_LABEL}
                </label>
                <div className="relative">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="unlock-search"
                    value={filter.text}
                    placeholder={SEARCH_PLACEHOLDER}
                    onChange={(e) => set({ text: e.target.value })}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
            {filtered && (
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={clear}>
                  <X aria-hidden /> {CLEAR_FILTERS_LABEL}
                </Button>
              </div>
            )}
          </div>

          {unlocks.isPending ? null : list.length === 0 ? (
            <EmptyState title={NO_REQUESTS_LABEL} />
          ) : groups.length === 0 ? (
            <EmptyState title={NO_MATCH_TITLE}>
              <span className="block">{NO_MATCH_BODY}</span>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={clear}>
                {CLEAR_FILTERS_LABEL}
              </Button>
            </EmptyState>
          ) : (
            groups.map((g) => (
              <div key={g.date}>
                <h3 className="flex items-baseline gap-2 border-b border-rule bg-muted/60 px-4 py-2 text-sm dsk:px-5">
                  <b className="font-semibold text-head dark:text-foreground">{dShort(g.date)}</b>
                  {relativeDay(g.date) && <span className="text-muted-foreground">{relativeDay(g.date)}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{dayGroupLabel(g.items.length)}</span>
                </h3>
                <ul>
                  {g.items.map((u) => (
                    <UnlockRow
                      key={u.id}
                      unlock={u}
                      name={name(u.seller)}
                      decider={u.decided_by && name(u.decided_by)}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </Section>
      </PageBody>
    </div>
  )
}

const STATUS_CHIP: Record<Status, string> = {
  requested: 'bg-warn-fill text-warn-fill-foreground',
  approved: 'bg-ok-fill text-ok-fill-foreground',
  rejected: 'bg-bad-fill text-bad-fill-foreground',
  closed: 'bg-muted text-muted-foreground',
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

function UnlockRow({ unlock, name, decider }: { unlock: Unlock; name: string; decider: string | null }) {
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
  const pending = unlock.status === 'requested'
  return (
    <li
      className={cn(
        'flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-rule px-4 py-3 last:border-0 dsk:px-5',
        pending && 'bg-warn-soft/40',
      )}
    >
      <span
        aria-hidden
        className="grid size-9 flex-none place-items-center rounded-full bg-selected text-sm font-semibold text-selected-foreground"
      >
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="font-semibold">{name}</b>
          <span
            className={cn(
              'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
              STATUS_CHIP[unlock.status],
            )}
          >
            {UNLOCK_STATUS_LABEL[unlock.status]}
          </span>
        </div>
        <p className="mt-1 text-base">{unlock.reason}</p>
        <small className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>{requestedAtLabel(unlock.requested_at)}</span>
          {decider && !pending && <span>{decidedLabel(unlock.status, decider, unlock.decided_at)}</span>}
        </small>
      </div>
      {actions.length > 0 && (
        <div className="flex gap-2 self-center">
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
