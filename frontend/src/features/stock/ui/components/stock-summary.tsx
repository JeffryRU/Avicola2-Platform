import { dateOf, dShort, clockTime } from '@/shared/domain/dates'
import { nf0 } from '@/shared/domain/format'
import type { StockDay, StockTotals } from '@/features/stock/domain/stock'
import {
  BY_LOCATION_TITLE,
  STATUS_EDITING,
  STATUS_PENDING,
  STATUS_SAVED,
  SUMMARY_TITLE,
  unitsLabel,
} from '@/features/stock/types/stock'
import { kgAmount } from '@/shared/types/labels'
import { StatusDot } from '@/shared/ui/components/feedback'
import { Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'

export function Summary({
  totals,
  record,
  dirty,
  note,
  byPlace,
  action,
}: {
  totals: StockTotals
  record?: StockDay
  dirty: boolean
  note?: string
  byPlace?: { location: string; units: number }[]
  action?: React.ReactNode
}) {
  const status = dirty ? STATUS_EDITING : record ? STATUS_SAVED : STATUS_PENDING
  const tone = dirty ? 'warn' : record ? 'ok' : 'draft'
  return (
    <Section
      title={SUMMARY_TITLE}
      aside={
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-sm',
            tone === 'warn' && 'font-medium text-warn hc:font-bold',
            tone === 'ok' && 'text-foreground',
          )}
        >
          <StatusDot tone={tone} />
          {status}
        </span>
      }
    >
      <div className="px-4 py-4 dsk:px-5">
        <b className="num block text-3xl leading-none font-medium hc:font-extrabold">{nf0(totals.units)}</b>
        <small className="mt-1.5 block text-sm text-muted-foreground">
          {unitsLabel(totals.units)} · {kgAmount(totals.kg)}
        </small>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-rule bg-rule">
        <div className="flex flex-col-reverse bg-surface px-4 py-3 dsk:px-5">
          <dt className="text-xs text-muted-foreground">calidad A</dt>
          <dd className="num text-lg font-medium hc:font-bold">{nf0(totals.unitsA)}</dd>
        </div>
        <div className="flex flex-col-reverse bg-surface px-4 py-3 dsk:px-5">
          <dt className="text-xs text-muted-foreground">calidad B</dt>
          <dd className="num text-lg font-medium hc:font-bold">{nf0(totals.unitsB)}</dd>
        </div>
      </dl>
      {byPlace && byPlace.length > 0 && (
        <div className="border-t border-rule px-4 py-3 dsk:px-5">
          <h3 className="eyebrow mb-1.5">{BY_LOCATION_TITLE}</h3>
          <ul className="grid gap-1 text-sm">
            {byPlace.map((p) => (
              <li key={p.location} className="flex gap-2">
                <span className="min-w-0 flex-1 truncate">{p.location}</span>
                <b className="num font-medium">{nf0(p.units)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(record ?? note) && (
        <div className="border-t border-rule px-4 py-3 dsk:px-5">
          {record && (
            <p className="text-sm text-muted-foreground">
              Registró <b className="font-medium text-foreground">{record.recorded_by}</b> ·{' '}
              {dShort(dateOf(record.recorded_at))}, {clockTime(record.recorded_at)}
            </p>
          )}
          {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
        </div>
      )}
      {action}
    </Section>
  )
}
