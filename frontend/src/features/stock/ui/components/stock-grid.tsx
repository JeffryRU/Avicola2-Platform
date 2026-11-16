import { dDM, dDow, diffDays, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1, keepDigits, RECORD_MAX_DIGITS } from '@/shared/domain/format'
import type { Product } from '@/shared/domain/products'
import { cellKey, kgOf, type StockDraft, type StockView, unitsAt } from '@/features/stock/domain/stock'
import { COLUMNS, lotAgeLabel, OLD_LOT, QUALITY_B_TAG } from '@/features/stock/types/stock'
import { kgAmount } from '@/shared/types/labels'
import { cn } from '@/shared/ui/lib/utils'

const cellCls =
  'h-10 w-full min-w-[4.25rem] rounded-[10px] border-[1.5px] border-border bg-white px-1.5 text-center text-[15px] tabular-nums outline-none transition-colors placeholder:text-faint focus:border-primary focus:ring-4 focus:ring-primary-ring'

/** Artículos en filas y lotes en columnas. Con `onChange` las celdas se escriben; sin él, se leen. */
export function Grid({
  groups,
  lots,
  day,
  lotDays,
  draft,
  unit,
  onChange,
}: {
  groups: { name: string; items: Product[] }[]
  lots: IsoDate[]
  day: IsoDate
  lotDays: number
  draft: StockDraft
  unit: StockView['unit']
  onChange?: (key: string, raw: string) => void
}) {
  const show = (p: Product, units: number, strong = false) => (
    <Amount units={units} kg={kgOf(p, units)} unit={unit} strong={strong} />
  )
  const sumKg = (items: Product[], lot?: IsoDate) =>
    items.reduce((s, p) => s + kgOf(p, lot ? unitsAt(draft, p.id, lot) : rowUnits(p)), 0)
  const rowUnits = (p: Product) => lots.reduce((s, lot) => s + unitsAt(draft, p.id, lot), 0)
  const th = 'px-1.5 pb-2 text-right align-bottom text-[12px] font-bold tracking-[0.03em] text-muted-foreground'
  return (
    // La tabla se desplaza dentro de su marco; la página nunca se ensancha.
    <div className="overflow-x-auto px-3 pt-2 pb-3 dsk:px-4">
      <table className="w-full border-separate border-spacing-0 text-[15px]">
        <thead>
          <tr>
            <th className={cn(th, 'sticky left-0 z-[1] bg-card !text-left uppercase')}>{COLUMNS.product}</th>
            {lots.map((lot) => {
              const age = diffDays(day, lot)
              return (
                <th key={lot} className={cn(th, 'whitespace-nowrap')} title={lotAgeLabel(age)}>
                  <span className="block uppercase">{dDow(lot)}</span>
                  <span className="block text-[13.5px] text-foreground tabular-nums">{dDM(lot)}</span>
                  {age > lotDays && <span className="block text-[10.5px] font-semibold text-warn">{OLD_LOT}</span>}
                </th>
              )
            })}
            <th className={cn(th, 'uppercase')}>{COLUMNS.total}</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.name}>
            <tr>
              <th
                scope="rowgroup"
                className="sticky left-0 z-[1] rounded-l-[10px] bg-muted px-3 py-2 text-left text-[13px] tracking-[0.02em] text-ink-2 uppercase"
              >
                {g.name}
              </th>
              {lots.map((lot) => (
                <td
                  key={lot}
                  className="bg-muted px-1.5 py-2 text-right text-[13px] text-muted-foreground tabular-nums"
                >
                  <Amount
                    units={g.items.reduce((s, p) => s + unitsAt(draft, p.id, lot), 0)}
                    kg={sumKg(g.items, lot)}
                    unit={unit}
                    compact
                  />
                </td>
              ))}
              <td className="rounded-r-[10px] bg-muted px-1.5 py-2 text-right text-[13px] font-bold tabular-nums">
                <Amount units={g.items.reduce((s, p) => s + rowUnits(p), 0)} kg={sumKg(g.items)} unit={unit} compact />
              </td>
            </tr>
            {g.items.map((p) => (
              <tr key={p.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-[1] max-w-[11rem] min-w-[7.5rem] border-b border-muted bg-card px-3 py-2 text-left font-bold"
                >
                  <span className="block truncate">{p.name}</span>
                  {p.quality === 'B' && (
                    <span className="mt-0.5 inline-block rounded-full bg-warn-soft px-1.5 text-[11px] font-bold text-warn">
                      {QUALITY_B_TAG}
                    </span>
                  )}
                </th>
                {lots.map((lot) => {
                  const key = cellKey(p.id, lot)
                  const units = unitsAt(draft, p.id, lot)
                  return (
                    <td key={lot} className="border-b border-muted px-1 py-1.5 text-right">
                      {onChange ? (
                        <>
                          <input
                            inputMode="numeric"
                            aria-label={`${p.name}, lote ${dDM(lot)}`}
                            placeholder="0"
                            value={draft[key] ?? ''}
                            onChange={(e) => onChange(key, keepDigits(e.target.value, RECORD_MAX_DIGITS))}
                            className={cellCls}
                          />
                          {unit !== 'units' && units > 0 && (
                            <small className="block pt-0.5 text-center text-[11.5px] text-muted-foreground tabular-nums">
                              {kgAmount(kgOf(p, units))}
                            </small>
                          )}
                        </>
                      ) : (
                        show(p, units)
                      )}
                    </td>
                  )
                })}
                <td className="border-b border-muted px-1.5 py-1.5 text-right">{show(p, rowUnits(p), true)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

/** Una cantidad en la unidad elegida: unidades, kg o las dos. */
export function Amount({
  units,
  kg,
  unit,
  strong = false,
  compact = false,
}: {
  units: number
  kg: number
  unit: StockView['unit']
  strong?: boolean
  compact?: boolean
}) {
  const main = unit === 'kg' ? nf1(kg) : nf0(units)
  return (
    <span className={cn('whitespace-nowrap tabular-nums', strong && 'font-bold', !units && 'font-normal text-faint')}>
      {main}
      {unit === 'both' && units > 0 && (
        <small className={cn('text-[11.5px] font-normal text-muted-foreground', compact ? 'ml-1' : 'block')}>
          {kgAmount(kg)}
        </small>
      )}
    </span>
  )
}
