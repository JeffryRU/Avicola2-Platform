import { useState } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/routes'
import { addDays, clockTime, dShort, today } from '@/shared/domain/dates'
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
import { DataTable } from '@/shared/ui/components/data-table'

type SacaRecord = NonNullable<ReturnType<typeof useSacaHistory>['data']>[number]
const farmOrder = (r: SacaRecord, group: string) => r.groups.find((x) => x.name === group)?.farm_order ?? 0

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
            <DataTable
              density="compact"
              rows={rows}
              rowKey={(r) => r.date}
              columns={[
                {
                  key: 'date',
                  sticky: true,
                  header: HISTORY_COLUMNS.date,
                  cell: (r) => (
                    <Link
                      to={`${paths.saca}?fecha=${r.date}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {dShort(r.date)}
                    </Link>
                  ),
                },
                ...groups.map((g) => ({
                  key: g,
                  header: g,
                  numeric: true,
                  cell: (r: SacaRecord) => nf0(farmOrder(r, g)),
                  faint: (r: SacaRecord) => !farmOrder(r, g),
                })),
                {
                  key: 'total',
                  header: HISTORY_COLUMNS.total,
                  numeric: true,
                  tone: 'strong',
                  cell: (r) => nf0(r.farm_order),
                },
                {
                  key: 'saved',
                  header: HISTORY_COLUMNS.saved,
                  tone: 'muted',
                  cell: (r) => `${clockTime(r.saved_at)} · ${r.saved_by}`,
                },
              ]}
            />
          )}
        </Section>
      </PageBody>
    </div>
  )
}
