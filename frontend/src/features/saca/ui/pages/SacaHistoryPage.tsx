import { useState } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/routes'
import { addDays, clockTime, dDow, dShort, today } from '@/shared/domain/dates'
import { nf0 } from '@/shared/domain/format'
import { useSacaHistory } from '@/features/saca/ui/hooks'
import {
  HISTORY_COLUMNS,
  HISTORY_EMPTY_BODY,
  HISTORY_EMPTY_TITLE,
  HISTORY_RANGES,
  HISTORY_SUBTITLE,
  HISTORY_TITLE,
} from '@/features/saca/types/saca'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Segmented } from '@/shared/ui/components/segmented'
import { SyncStatus } from '@/shared/ui/components/sync-status'
import { tableCls } from '@/shared/ui/lib/table-styles'
import { cn } from '@/shared/ui/lib/utils'

/** Las sacas guardadas: lo que se pidió a granja cada día, por tipo (la más reciente arriba). */
export function SacaHistoryPage() {
  const [range, setRange] = useState<number>(30)
  const to = today()
  const query = useSacaHistory(addDays(to, -(range - 1)), to)
  const rows = query.data ?? []
  const groups = rows[0]?.groups.map((g) => g.name) ?? []
  return (
    <div>
      <PageHeader title={HISTORY_TITLE} subtitle={HISTORY_SUBTITLE} back={paths.saca} />
      <PageBody>
        <div className="mb-4">
          <Segmented
            value={String(range)}
            onChange={(v) => setRange(Number(v))}
            options={HISTORY_RANGES.map((r) => ({ value: String(r.days), label: r.label }))}
          />
        </div>
        <SyncStatus queries={[query]} />
        <Section>
          {query.data && rows.length === 0 ? (
            <EmptyState title={HISTORY_EMPTY_TITLE}>{HISTORY_EMPTY_BODY}</EmptyState>
          ) : (
            <div className="relative overflow-x-auto">
              <table className={cn(tableCls.table, 'text-sm')}>
                <thead>
                  <tr>
                    <th className={cn(tableCls.th, 'text-left')}>{HISTORY_COLUMNS.date}</th>
                    {groups.map((g) => (
                      <th key={g} className={tableCls.th}>
                        {g}
                      </th>
                    ))}
                    <th className={tableCls.th}>{HISTORY_COLUMNS.total}</th>
                    <th className={cn(tableCls.th, 'text-left')}>{HISTORY_COLUMNS.saved}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.date} className={tableCls.row}>
                      <td className={tableCls.td}>
                        <Link
                          to={`${paths.saca}?fecha=${r.date}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {dDow(r.date)} {dShort(r.date)}
                        </Link>
                      </td>
                      {groups.map((g) => {
                        const n = r.groups.find((x) => x.name === g)?.farm_order ?? 0
                        return (
                          <td key={g} className={cn(tableCls.td, 'num', !n && 'text-faint')}>
                            {nf0(n)}
                          </td>
                        )
                      })}
                      <td className={cn(tableCls.td, 'num font-semibold')}>{nf0(r.farm_order)}</td>
                      <td className={cn(tableCls.td, 'text-muted-foreground')}>
                        {clockTime(r.saved_at)} · {r.saved_by}
                      </td>
                    </tr>
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
