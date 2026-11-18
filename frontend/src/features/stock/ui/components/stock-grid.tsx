import { dDM, dDow, diffDays, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1, keepDigits, RECORD_MAX_DIGITS } from '@/shared/domain/format'
import type { Product } from '@/shared/domain/products'
import { cellKey, kgOf, type StockDraft, type StockView, unitsAt } from '@/features/stock/domain/stock'
import { COLUMNS, DISCARD_TAG, lotAgeLabel, OLD_LOT, QUALITY_B_TAG } from '@/features/stock/types/stock'
import { kgAmount } from '@/shared/types/labels'
import { tableStyles } from '@/shared/ui/lib/table-styles'
import { cn } from '@/shared/ui/lib/utils'

const ed = tableStyles.edit
const cellCls = cn(ed.input({ align: 'right' }), 'w-full min-w-17')

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
  const th = cn(ed.th, 'px-1.5 pt-0 pb-2 text-right align-bottom')
  return (
    // La tabla se desplaza dentro de su marco; la página nunca se ensancha.
    <div className="relative overflow-x-auto px-3 pt-3 pb-3 dsk:px-4">
      <table className={cn(ed.table, 'text-base')}>
        <thead>
          <tr>
            <th className={cn(th, ed.stickyCol, '!text-left')}>{COLUMNS.product}</th>
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
            <tr className={ed.groupRow}>
              <th
                scope="rowgroup"
                className={cn(ed.stickyCol, ed.cell, 'eyebrow px-3 py-2 text-left hc:text-foreground')}
              >
                {g.name}
              </th>
              {lots.map((lot) => (
                <td
                  key={lot}
                  className={cn(ed.cell, 'num px-1.5 py-2 text-right text-sm font-normal text-muted-foreground')}
                >
                  <Amount
                    units={g.items.reduce((s, p) => s + unitsAt(draft, p.id, lot), 0)}
                    kg={sumKg(g.items, lot)}
                    unit={unit}
                    compact
                  />
                </td>
              ))}
              <td className={cn(ed.cell, 'num px-1.5 py-2 text-right text-sm')}>
                <Amount units={g.items.reduce((s, p) => s + rowUnits(p), 0)} kg={sumKg(g.items)} unit={unit} compact />
              </td>
            </tr>
            {g.items.map((p) => (
              <tr key={p.id}>
                <th
                  scope="row"
                  className={cn(
                    ed.stickyCol,
                    ed.cell,
                    'max-w-44 min-w-30 px-3 py-2 text-left font-medium dsk:max-w-64',
                  )}
                >
                  {/* En el celular el nombre se corta (la columna queda fija); en escritorio, completo. */}
                  <span className="block truncate dsk:whitespace-normal" title={p.name}>
                    {p.name}
                  </span>
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
                    <td key={lot} className={cn(ed.cell, 'px-1 py-1.5 text-right')}>
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
                <td className={cn(ed.cell, 'px-1.5 py-1.5 text-right')}>{show(p, rowUnits(p), true)}</td>
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
