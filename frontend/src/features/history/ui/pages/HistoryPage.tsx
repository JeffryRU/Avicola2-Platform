import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { addDays, dShort, formatTime, hhmm, today } from '@/shared/domain/dates'
import { isSupervisor } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { useSellers } from '@/features/dashboards/ui/hooks'
import { dateOf } from '@/features/editing/domain/editing'
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
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section, tableCls } from '@/shared/ui/components/layout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/components/shadcn/select'
import { cn } from '@/shared/ui/lib/utils'

const ALL = 'all'
const triggerCls = '!h-10 min-w-[11rem] rounded-[10px] border-[1.5px] bg-white font-semibold'

/** Quién creó o modificó cada proyección (el vendedor ve lo suyo; el supervisor, todo). */
export function HistoryPage() {
  const { history } = useContainer()
  const { seller: me } = useRequiredSession()
  const team = isSupervisor(me)
  const { catalog } = useCatalog()
  const sellers = useSellers().data ?? []
  const [range, setRange] = useState<number>(HISTORY_RANGES[0].days)
  const [who, setWho] = useState(ALL)
  const to = today()
  const from = addDays(to, -(range - 1))
  const seller = team && who !== ALL ? who : undefined
  const changes = useQuery({
    queryKey: ['history', from, to, seller],
    queryFn: () => history.changes(from, to, seller),
  })
  const names = new Map([...sellers.map((s) => [s.username, s.name] as const), [me.username, me.name] as const])
  const nameOf = (username: string) => names.get(username) ?? username
  const list = changes.data ?? []

  return (
    <div>
      <PageHeader title={HISTORY_TITLE} subtitle={team ? HISTORY_SUBTITLE_TEAM : HISTORY_SUBTITLE_SELLER} />
      <PageBody>
        <div className="mb-3 flex flex-wrap gap-2.5 dsk:mb-4">
          <div>
            <span id="h-range" className="mb-1 ml-0.5 block text-[12.5px] font-bold text-ink-2">
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
              <span id="h-seller" className="mb-1 ml-0.5 block text-[12.5px] font-bold text-ink-2">
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
            <div className="overflow-x-auto px-3 pt-3 pb-3.5">
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th className={tableCls.th}>{COLUMNS.when}</th>
                    {team && <th className={tableCls.th}>{COLUMNS.seller}</th>}
                    <th className={tableCls.th}>{COLUMNS.day}</th>
                    <th className={tableCls.th}>{COLUMNS.who}</th>
                    <th className={tableCls.th}>{COLUMNS.action}</th>
                    <th className={tableCls.th}>{COLUMNS.units}</th>
                    <th className={cn(tableCls.th, '!text-left')}>{COLUMNS.detail}</th>
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
        <b className="block">{dShort(dateOf(c.changed_at))}</b>
        <small className="text-muted-foreground">{formatTime(hhmm(c.changed_at))}</small>
      </td>
      {team && <td className={tableCls.td}>{nameOf(c.seller)}</td>}
      <td className={tableCls.td}>{dShort(c.date)}</td>
      <td className={tableCls.td}>
        <span className={cn(bySupervisor(c) && 'font-bold text-primary')}>{nameOf(c.author)}</span>
      </td>
      <td className={tableCls.td}>
        <span className="block">{CHANGE_ACTION_LABEL[c.action]}</span>
        {c.after_cutoff && (
          <span className="mt-1 inline-block rounded-full bg-warn-soft px-2 py-0.5 text-[11.5px] font-bold text-warn">
            {AFTER_CUTOFF_LABEL}
          </span>
        )}
      </td>
      <td className={cn(tableCls.td, 'font-bold')}>{unitsChange(c.before_total, c.after_total)}</td>
      <td className={cn(tableCls.td, '!text-left text-[13px] whitespace-normal text-ink-2')}>
        {lines.map((l) => `${l.product}: ${c.before ? `${String(l.before)} → ` : ''}${String(l.after)}`).join(' · ')}
      </td>
    </tr>
  )
}
