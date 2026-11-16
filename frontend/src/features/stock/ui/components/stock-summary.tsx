import { Check } from 'lucide-react'
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
import { Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'

const labelCls = 'mb-1 block text-[12px] font-bold tracking-[0.04em] text-muted-foreground uppercase'

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
  return (
    <Section>
      <div className="p-4 dsk:p-5">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[15px] font-extrabold">{SUMMARY_TITLE}</h2>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold',
              dirty ? 'bg-warn-soft text-warn' : record ? 'bg-ok-soft text-ok' : 'bg-muted text-ink-2',
            )}
          >
            {record && !dirty && <Check className="size-3.5" strokeWidth={3} />}
            {status}
          </span>
        </div>
        <div className="mt-3">
          <b className="block text-[34px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
            {nf0(totals.units)}
          </b>
          <small className="mt-1 block text-[13px] text-muted-foreground">
            {unitsLabel(totals.units)} · {kgAmount(totals.kg)}
          </small>
        </div>
        <dl className="mt-3.5 grid grid-cols-2 gap-2 border-t border-muted pt-3 text-[13px]">
          <div>
            <dd className="text-[16px] font-extrabold tabular-nums">{nf0(totals.unitsA)}</dd>
            <dt className="text-muted-foreground">calidad A</dt>
          </div>
          <div>
            <dd className="text-[16px] font-extrabold tabular-nums">{nf0(totals.unitsB)}</dd>
            <dt className="text-muted-foreground">calidad B</dt>
          </div>
        </dl>
        {byPlace && byPlace.length > 0 && (
          <div className="mt-3.5 border-t border-muted pt-3">
            <h3 className={labelCls}>{BY_LOCATION_TITLE}</h3>
            <ul className="grid gap-1 text-[13.5px]">
              {byPlace.map((p) => (
                <li key={p.location} className="flex gap-2">
                  <span className="min-w-0 flex-1 truncate">{p.location}</span>
                  <b className="tabular-nums">{nf0(p.units)}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
        {record && (
          <p className="mt-3.5 border-t border-muted pt-3 text-[13px] text-muted-foreground">
            Registró <b className="text-foreground">{record.recorded_by}</b> · {dShort(dateOf(record.recorded_at))},{' '}
            {clockTime(record.recorded_at)}
          </p>
        )}
        {note && <p className="mt-2 text-[13px] text-muted-foreground">{note}</p>}
        {action}
      </div>
    </Section>
  )
}
