import { useState } from 'react'
import { addDays, dateOf, dShort, today, clockTime } from '@/shared/domain/dates'
import { isSupervisor } from '@/shared/domain/session'
import { useRequiredSession } from '@/features/auth'
import { useCatalog } from '@/features/catalog'
import { useSellers } from '@/features/sellers'
import { useHistory } from '@/features/history/ui/hooks'
import { bySupervisor, changedLines, type ProjectionChange } from '@/features/history/domain/history'
import {
  AFTER_CUTOFF_LABEL,
  ALL_SELLERS_LABEL,
  CHANGE_ACTION_LABEL,
  COLUMNS,
  HISTORY_RANGES,
  HISTORY_SUBTITLE_SELLER,
  HISTORY_SUBTITLE_TEAM,
  HISTORY_TITLE,
  NO_CHANGES_LABEL,
  PERIOD_LABEL,
  SELLER_LABEL,
  unitsChange,
} from '@/features/history/types/history'
import { EmptyState, StatusDot } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { tableCls } from '@/shared/ui/lib/table-styles'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/components/shadcn/select'
import { cn } from '@/shared/ui/lib/utils'

const ALL = 'all'
const triggerCls = 'min-w-44'

/** Quién creó o modificó cada proyección (el vendedor ve lo suyo; el supervisor, todo). */
export function HistoryPage() {
  const { seller: me } = useRequiredSession()
  const team = isSupervisor(me)
  const { catalog } = useCatalog()
  const sellers = useSellers().data ?? []
  const [range, setRange] = useState<number>(HISTORY_RANGES[0].days)
  const [who, setWho] = useState(ALL)
  const to = today()
  const from = addDays(to, -(range - 1))
  const seller = team && who !== ALL ? who : undefined
  const changes = useHistory(from, to, seller)
  const names = new Map([...sellers.map((s) => [s.username, s.name] as const), [me.username, me.name] as const])
  const nameOf = (username: string) => names.get(username) ?? username
  const list = changes.data ?? []

  return (
    <div>
      <PageHeader title={HISTORY_TITLE} subtitle={team ? HISTORY_SUBTITLE_TEAM : HISTORY_SUBTITLE_SELLER} />
      <PageBody>
        <div className="mb-4 flex flex-wrap gap-3">
          <div>
            <span id="h-range" className="mb-1 block text-sm font-medium text-ink-2">
              {PERIOD_LABEL}
            </span>
            <Select value={String(range)} onValueChange={(v) => setRange(Number(v))}>
              <SelectTrigger aria-labelledby="h-range" className={triggerCls}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HISTORY_RANGES.map((r) => (
                  <SelectItem key={r.days} value={String(r.days)}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {team && (
            <div>
              <span id="h-seller" className="mb-1 block text-sm font-medium text-ink-2">
                {SELLER_LABEL}
              </span>
              <Select value={who} onValueChange={setWho}>
                <SelectTrigger aria-labelledby="h-seller" className={triggerCls}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{ALL_SELLERS_LABEL}</SelectItem>
                  {sellers
                    .filter((s) => !isSupervisor(s))
                    .map((s) => (
                      <SelectItem key={s.username} value={s.username}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <Section>
          {changes.isPending ? null : list.length === 0 ? (
            <EmptyState title={NO_CHANGES_LABEL} />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th className={tableCls.th}>{COLUMNS.when}</th>
                    {team && <th className={cn(tableCls.th, 'text-left')}>{COLUMNS.seller}</th>}
                    <th className={cn(tableCls.th, 'text-left')}>{COLUMNS.day}</th>
                    <th className={cn(tableCls.th, 'text-left')}>{COLUMNS.who}</th>
                    <th className={cn(tableCls.th, 'text-left')}>{COLUMNS.action}</th>
                    <th className={tableCls.th}>{COLUMNS.sheet}</th>
                    <th className={tableCls.th}>{COLUMNS.units}</th>
                    <th className={cn(tableCls.th, 'text-left')}>{COLUMNS.detail}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <ChangeRow
                      key={c.id}
                      change={c}
                      team={team}
                      nameOf={nameOf}
                      lines={catalog ? changedLines(c, catalog) : []}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </PageBody>
    </div>
  )
}

function ChangeRow({
  change: c,
  team,
  nameOf,
  lines,
}: {
  change: ProjectionChange
  team: boolean
  nameOf: (u: string) => string
  lines: ReturnType<typeof changedLines>
}) {
  return (
    <tr className={tableCls.row}>
      <td className={tableCls.td}>
        <span className="block font-medium">{dShort(dateOf(c.changed_at))}</span>
        <small className="num text-xs text-muted-foreground">{clockTime(c.changed_at)}</small>
      </td>
      {team && <td className={cn(tableCls.td, 'text-left')}>{nameOf(c.seller)}</td>}
      <td className={cn(tableCls.td, 'text-left')}>{dShort(c.date)}</td>
      <td className={cn(tableCls.td, 'text-left')}>
        <span className={cn(bySupervisor(c) && 'font-semibold text-selected-foreground')}>{nameOf(c.author)}</span>
      </td>
      <td className={cn(tableCls.td, 'text-left')}>
        <span className="block">{CHANGE_ACTION_LABEL[c.action]}</span>
        {c.after_cutoff && (
          <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-warn hc:font-bold">
            <StatusDot tone="warn" className="size-1.5" />
            {AFTER_CUTOFF_LABEL}
          </span>
        )}
      </td>
      <td className={cn(tableCls.td, 'num', c.sheet == null && 'text-faint')}>{c.sheet ?? '—'}</td>
      <td className={cn(tableCls.td, 'num font-medium')}>{unitsChange(c.before_total, c.after_total)}</td>
      <td className={cn(tableCls.td, 'min-w-56 text-left text-sm whitespace-normal text-ink-2')}>
        {lines.map((l) => `${l.product}: ${c.before ? `${String(l.before)} → ` : ''}${String(l.after)}`).join(' · ')}
      </td>
    </tr>
  )
}
