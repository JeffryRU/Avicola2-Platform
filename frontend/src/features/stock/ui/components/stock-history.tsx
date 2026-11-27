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
        <p className="px-4 py-4 text-base text-muted-foreground dsk:px-5">{RECORDED_EMPTY}</p>
      ) : (
        <ul className="p-1.5">
          {days.map((d) => (
            <li key={d.date}>
              <button
                type="button"
                aria-current={d.date === selected}
                onClick={() => onSelect(d.date)}
                className={cn(
                  'flex min-h-touch w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted',
                  d.date === selected &&
                    'bg-nav-active text-nav-active-foreground hover:bg-nav-active hc:font-semibold',
                )}
              >
                <span className="min-w-0 flex-1">
                  <b className="block text-base font-medium">{dShort(d.date)}</b>
                  <small className="block truncate text-xs text-muted-foreground">
                    {d.recorded_by} · {clockTime(d.recorded_at)}
                  </small>
                </span>
                <span className="num text-right">
                  <b className="block text-base font-medium">{nf0(d.total_units)}</b>
                  <small className="block text-xs text-muted-foreground">{kgAmount(d.total_kg)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
