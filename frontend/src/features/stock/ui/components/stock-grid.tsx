import { dDM, dDow, diffDays, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1, keepDigits, RECORD_MAX_DIGITS } from '@/shared/domain/format'
import type { Product } from '@/shared/domain/products'
import { cellKey, kgOf, type StockDraft, type StockView, unitsAt } from '@/features/stock/domain/stock'
import { COLUMNS, DISCARD_TAG, lotAgeLabel, OLD_LOT, QUALITY_B_TAG } from '@/features/stock/types/stock'
import { kgAmount } from '@/shared/types/labels'
import { cn } from '@/shared/ui/lib/utils'

const cellCls =
  'num h-touch w-full min-w-17 rounded-sm border-control border-input bg-surface px-1.5 text-right text-md outline-none transition-colors placeholder:text-faint focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring dsk:h-9 dsk:text-base'

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
  const th =
    'border-b border-rule-strong px-1.5 pb-2 text-right align-bottom text-xs font-medium text-muted-foreground hc:border-b-heavy hc:font-bold hc:text-foreground'
  return (
    // La tabla se desplaza dentro de su marco; la página nunca se ensancha.
    <div className="relative overflow-x-auto px-3 pt-3 pb-3 dsk:px-4">
      <table className="w-full border-separate border-spacing-0 text-base">
        <thead>
          <tr>
            <th className={cn(th, 'sticky left-0 z-[1] bg-surface !text-left')}>{COLUMNS.product}</th>
            {lots.map((lot) => {
              const age = diffDays(day, lot)
              return (
                <th key={lot} className={cn(th, 'whitespace-nowrap')} title={lotAgeLabel(age)}>
                  <span className="block">{dDow(lot)}</span>
                  <span className="num block text-sm text-foreground">{dDM(lot)}</span>
                  {age > lotDays && (
                    <span className="block text-2xs font-medium text-warn hc:font-bold">{OLD_LOT}</span>
                  )}
                </th>
              )
            })}
            <th className={th}>{COLUMNS.total}</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.name}>
            <tr>
              <th
                scope="rowgroup"
                className="eyebrow sticky left-0 z-[1] border-b border-rule bg-muted px-3 py-2 text-left hc:text-foreground"
              >
                {g.name}
              </th>
              {lots.map((lot) => (
                <td
                  key={lot}
                  className="num border-b border-rule bg-muted px-1.5 py-2 text-right text-sm text-muted-foreground"
                >
                  <Amount
                    units={g.items.reduce((s, p) => s + unitsAt(draft, p.id, lot), 0)}
                    kg={sumKg(g.items, lot)}
                    unit={unit}
                    compact
                  />
                </td>
              ))}
              <td className="num border-b border-rule bg-muted px-1.5 py-2 text-right text-sm font-semibold">
                <Amount units={g.items.reduce((s, p) => s + rowUnits(p), 0)} kg={sumKg(g.items)} unit={unit} compact />
              </td>
            </tr>
            {g.items.map((p) => (
              <tr key={p.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-[1] max-w-44 min-w-30 border-b border-rule bg-surface px-3 py-2 text-left font-medium"
                >
                  <span className="block truncate">{p.name}</span>
                  {p.quality === 'D' && (
                    <span className="mt-0.5 block text-2xs font-medium text-muted-foreground hc:font-bold">
                      {DISCARD_TAG}
                    </span>
                  )}
                  {p.quality === 'B' && (
                    <span className="mt-0.5 block text-2xs font-medium text-warn hc:font-bold">{QUALITY_B_TAG}</span>
                  )}
                </th>
                {lots.map((lot) => {
                  const key = cellKey(p.id, lot)
                  const units = unitsAt(draft, p.id, lot)
                  return (
                    <td key={lot} className="border-b border-rule px-1 py-1.5 text-right">
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
                            <small className="num block pt-0.5 text-right text-2xs text-muted-foreground">
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
                <td className="border-b border-rule px-1.5 py-1.5 text-right">{show(p, rowUnits(p), true)}</td>
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
    <span className={cn('num whitespace-nowrap', strong && 'font-semibold', !units && 'font-normal text-faint')}>
      {main}
      {unit === 'both' && units > 0 && (
        <small className={cn('text-2xs font-normal text-muted-foreground', compact ? 'ml-1' : 'block')}>
          {kgAmount(kg)}
        </small>
      )}
    </span>
  )
}
