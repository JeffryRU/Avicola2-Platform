import { addDays, dDM, dDow, type IsoDate } from '@/shared/domain/dates'
import {
  ALL,
  LOT_OFFSETS,
  QUALITIES,
  type StockOptions,
  type StockView,
  toggleLot,
  typesOf,
  UNITS,
} from '@/features/stock/domain/stock'
import {
  ALL_LOCATIONS,
  ALL_TYPES,
  LOCATION_LABEL,
  lotAgeLabel,
  LOTS_HINT,
  LOTS_LABEL,
  QUALITY_LABEL,
  QUALITY_OPTION,
  TYPE_LABEL,
  UNIT_LABEL,
  UNIT_OPTION,
} from '@/features/stock/types/stock'
import { Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'

const selectCls =
  'h-11 w-full min-w-0 rounded-[10px] border-[1.5px] border-border bg-white px-3 text-[14.5px] font-semibold outline-none focus:border-primary focus:ring-4 focus:ring-primary-ring'
const labelCls = 'mb-1 block text-[12px] font-bold tracking-[0.04em] text-muted-foreground uppercase'

/** Qué se ve: ubicación, tipo, calidad, unidad y los lotes que van como columnas. */
export function Filters({
  view,
  setView,
  options,
  locations,
  day,
}: {
  view: StockView
  setView: (patch: Partial<StockView>) => void
  options: StockOptions
  locations: string[]
  day: IsoDate
}) {
  return (
    <Section className="mb-4">
      <div className="grid gap-3 px-4 pt-4 sm:grid-cols-2 dsk:px-5 @4xl/main:grid-cols-4">
        <Pick label={LOCATION_LABEL} value={view.location} onChange={(location) => setView({ location })}>
          <option value={ALL}>{ALL_LOCATIONS}</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Pick>
        <Pick label={TYPE_LABEL} value={view.type} onChange={(type) => setView({ type })}>
          <option value={ALL}>{ALL_TYPES}</option>
          {typesOf(options.items).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Pick>
        <Pick
          label={QUALITY_LABEL}
          value={view.quality}
          onChange={(q) => setView({ quality: QUALITIES.find((x) => x === q) ?? ALL })}
        >
          {QUALITIES.map((q) => (
            <option key={q} value={q}>
              {QUALITY_OPTION[q]}
            </option>
          ))}
        </Pick>
        <Pick
          label={UNIT_LABEL}
          value={view.unit}
          onChange={(u) => setView({ unit: UNITS.find((x) => x === u) ?? 'units' })}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_OPTION[u]}
            </option>
          ))}
        </Pick>
      </div>
      <div className="px-4 pt-3 pb-4 dsk:px-5">
        <span className={labelCls}>{LOTS_LABEL}</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={LOTS_LABEL}>
          {LOT_OFFSETS.map((offset) => {
            const lot = addDays(day, -offset)
            const on = view.lots.includes(offset)
            return (
              <button
                key={offset}
                type="button"
                aria-pressed={on}
                title={lotAgeLabel(offset)}
                onClick={() => setView({ lots: toggleLot(view.lots, offset) })}
                className={cn(
                  'h-9 rounded-full border-[1.5px] px-3 text-[13px] font-bold tabular-nums transition-colors',
                  on ? 'border-primary bg-primary text-white' : 'border-border bg-white text-ink-2',
                )}
              >
                {dDow(lot)} {dDM(lot)}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[12.5px] text-muted-foreground">{LOTS_HINT}</p>
      </div>
    </Section>
  )
}

function Pick({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="block min-w-0">
      <span className={labelCls}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        {children}
      </select>
    </label>
  )
}
