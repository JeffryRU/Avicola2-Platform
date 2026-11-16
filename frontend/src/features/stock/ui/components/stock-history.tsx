import { dShort, type IsoDate, clockTime } from '@/shared/domain/dates'
import { nf0 } from '@/shared/domain/format'
import type { StockDay } from '@/features/stock/domain/stock'
import { RECORDED_EMPTY, RECORDED_TITLE } from '@/features/stock/types/stock'
import { kgAmount } from '@/shared/types/labels'
import { Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'

/** Últimos días con registro: un toque abre ese día. */
export function History({
  days,
  selected,
  onSelect,
  pending,
}: {
  days: StockDay[]
  selected: IsoDate
  onSelect: (day: IsoDate) => void
  pending: boolean
}) {
  return (
    <Section title={RECORDED_TITLE}>
      {pending ? null : days.length === 0 ? (
        <p className="px-4 pt-1 pb-5 text-[14px] text-muted-foreground dsk:px-5">{RECORDED_EMPTY}</p>
      ) : (
        <ul className="px-2 pt-1 pb-2.5">
          {days.map((d) => (
            <li key={d.date}>
              <button
                type="button"
                aria-current={d.date === selected}
                onClick={() => onSelect(d.date)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-muted/70',
                  d.date === selected && 'bg-secondary hover:bg-secondary',
                )}
              >
                <span className="min-w-0 flex-1">
                  <b className="block text-[14.5px]">{dShort(d.date)}</b>
                  <small className="block truncate text-[12.5px] text-muted-foreground">
                    {d.recorded_by} · {clockTime(d.recorded_at)}
                  </small>
                </span>
                <span className="text-right tabular-nums">
                  <b className="block text-[14.5px]">{nf0(d.total_units)}</b>
                  <small className="block text-[12.5px] text-muted-foreground">{kgAmount(d.total_kg)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
