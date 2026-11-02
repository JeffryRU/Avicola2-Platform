import { dShort, relativeDay, type IsoDate } from '@/core/domain/dates'
import { nf0, nf1 } from '@/core/domain/format'
import { sumUnits, type Catalog } from '@/modules/planning/domain/catalog'
import { parseCell, type Draft } from '@/modules/planning/domain/draft'
import type { Product } from '@/modules/planning/domain/schemas'
import { cn } from '@/ui/lib/utils'

interface Props {
  draft: Draft
  dates: IsoDate[]
  products: Product[]
  catalog: Catalog
  invalid: IsoDate[]
  mobile: boolean
  onChange: (date: IsoDate, productId: string, units: number | null) => void
}

/** Navegación tipo hoja de cálculo: Enter/↓ baja, ↑ sube. */
function onCellKey(e: React.KeyboardEvent<HTMLInputElement>, columns: number) {
  if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
  const cells = [...document.querySelectorAll<HTMLInputElement>('[data-cell]')]
  const i = cells.indexOf(e.currentTarget)
  const next = cells[e.key === 'ArrowUp' ? i - columns : i + columns]
  if (next) {
    e.preventDefault()
    next.focus()
    next.select()
  }
}

/** Matriz producto × día para escribir unidades; los kg se calculan solos. */
export function ProjectionMatrix({ draft, dates, products, catalog, invalid, mobile, onChange }: Props) {
  const value = (d: IsoDate, p: Product) => draft.units[d]?.[p.id]
  const dayKg = (d: IsoDate) => catalog.kg(draft.units[d] ?? {})
  const productUnits = (p: Product) => dates.reduce((s, d) => s + (value(d, p) ?? 0), 0)
  const totalUnits = dates.reduce((s, d) => s + sumUnits(draft.units[d]), 0)
  const totalKg = dates.reduce((s, d) => s + dayKg(d), 0)

  const cell = (d: IsoDate, p: Product) => {
    const v = value(d, p)
    return (
      <>
        <input
          data-cell={`${d}|${p.id}`}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          placeholder={mobile ? '0' : undefined}
          value={v ?? ''}
          aria-label={`${p.name}, ${dShort(d)}, unidades`}
          aria-invalid={invalid.includes(d)}
          onChange={(e) => onChange(d, p.id, parseCell(e.target.value))}
          onKeyDown={(e) => onCellKey(e, dates.length)}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-[38px] rounded-[10px] border-[1.5px] bg-white text-center text-[15px] font-bold transition outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-ring',
            mobile ? 'w-[52px]' : 'w-16',
            invalid.includes(d) && 'border-[#F3B3B4] focus:border-destructive',
          )}
        />
        {mobile && (
          <small className="mt-0.5 block text-[10px] whitespace-nowrap text-muted-foreground">
            {v ? `${nf1(v * p.kg_per_unit)} kg` : ' '}
          </small>
        )}
      </>
    )
  }

  const th = 'bg-secondary px-2 py-2.5 text-center font-bold whitespace-nowrap'
  const head = (d: IsoDate) => (
    <>
      {dShort(d)}
      <small className="block text-[11px] font-bold text-primary">{relativeDay(d) ?? ' '}</small>
    </>
  )

  if (mobile) {
    const stk =
      'sticky left-0 z-[2] min-w-24 max-w-24 bg-white pl-3 text-left shadow-[6px_0_8px_-6px_rgba(11,44,97,0.18)]'
    return (
      <div className="mt-2.5 overflow-hidden rounded-[18px] bg-card py-1.5 shadow-card">
        <div className="overflow-x-auto overscroll-x-contain">
          <table id="mx" className="min-w-full border-separate border-spacing-0 text-[12.5px]">
            <thead>
              <tr>
                <th className={cn(th, stk, 'z-[3] bg-secondary')}>
                  Producto<small className="block font-medium text-muted-foreground">Presentación</small>
                </th>
                {dates.map((d) => (
                  <th key={d} className={cn(th, invalid.includes(d) && 'text-destructive')}>
                    {head(d)}
                  </th>
                ))}
                <th className={cn(th, 'pr-3')}>Total</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className={cn(stk, 'border-b border-muted py-[7px]')}>
                    <b className="block text-[13.5px]">{p.name}</b>
                    <small className="text-[10.5px] text-muted-foreground">{p.kg_per_unit.toFixed(2)} kg/unidad</small>
                  </td>
                  {dates.map((d) => (
                    <td key={d} className="min-w-16 border-b border-muted px-1 py-[7px] text-center">
                      {cell(d, p)}
                    </td>
                  ))}
                  <td className="min-w-[60px] border-b border-muted pr-3 text-center">
                    <b className="text-sm font-extrabold">{nf0(productUnits(p))}</b>
                    <small className="block text-[10.5px] font-semibold text-ink-2">
                      {nf1(productUnits(p) && dates.reduce((s, d) => s + (value(d, p) ?? 0) * p.kg_per_unit, 0))} kg
                    </small>
                  </td>
                </tr>
              ))}
              <tr className="[&>td]:border-0 [&>td]:bg-secondary [&>td]:py-[11px] [&>td]:text-center [&>td]:font-extrabold">
                <td className={cn(stk, '!bg-secondary text-[12.5px]')}>Total por día</td>
                {dates.map((d) => (
                  <td key={d}>
                    <b className="text-sm">{nf0(sumUnits(draft.units[d]))}</b>
                    <small className="block text-[10.5px] font-semibold text-ink-2">{nf1(dayKg(d))} kg</small>
                  </td>
                ))}
                <td className="pr-3">
                  <b className="text-sm" data-testid="grand-units">
                    {nf0(totalUnits)}
                  </b>
                  <small className="block text-[10.5px] font-semibold text-ink-2">{nf1(totalKg)} kg</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-[18px] bg-card p-2.5 shadow-card">
      <table id="mx" className="w-full border-separate border-spacing-0 text-[13.5px]">
        <thead>
          <tr>
            <th rowSpan={2} className={cn(th, 'rounded-tl-[10px] text-left')}>
              Producto
              <br />
              <small className="font-medium text-muted-foreground">Presentación</small>
            </th>
            {dates.map((d) => (
              <th key={d} colSpan={2} className={cn(th, invalid.includes(d) && 'text-destructive')}>
                {head(d)}
              </th>
            ))}
            <th colSpan={2} className={cn(th, 'rounded-tr-[10px]')}>
              Total producto
            </th>
          </tr>
          <tr className="[&>th]:bg-side [&>th]:px-2 [&>th]:py-1.5 [&>th]:text-[11.5px] [&>th]:font-semibold [&>th]:text-muted-foreground">
            {dates.map((d) => [<th key={`${d}u`}>Unid.</th>, <th key={`${d}k`}>Kg</th>])}
            <th>Unid.</th>
            <th>Kg</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="[&>td]:border-b [&>td]:border-muted [&>td]:px-2 [&>td]:py-1.5 [&>td]:text-center">
              <td className="!text-left whitespace-nowrap">
                <b className="block text-sm">{p.name}</b>
                <small className="text-[11.5px] text-muted-foreground">{p.kg_per_unit.toFixed(2)} kg/unidad</small>
              </td>
              {dates.map((d) => [
                <td key={`${d}u`}>{cell(d, p)}</td>,
                <td key={`${d}k`} className="min-w-[52px] text-[13px] text-muted-foreground">
                  {value(d, p) ? nf1((value(d, p) ?? 0) * p.kg_per_unit) : '-'}
                </td>,
              ])}
              <td className="font-extrabold">{nf0(productUnits(p))}</td>
              <td className="font-extrabold text-ink-2">
                {nf1(dates.reduce((s, d) => s + (value(d, p) ?? 0) * p.kg_per_unit, 0))}
              </td>
            </tr>
          ))}
          <tr className="[&>td]:border-0 [&>td]:bg-secondary [&>td]:px-2 [&>td]:py-3 [&>td]:text-center [&>td]:font-extrabold">
            <td className="rounded-bl-[10px] !text-left">Total por día</td>
            {dates.map((d) => [
              <td key={`${d}u`}>{nf0(sumUnits(draft.units[d]))}</td>,
              <td key={`${d}k`}>{nf1(dayKg(d))}</td>,
            ])}
            <td data-testid="grand-units">{nf0(totalUnits)}</td>
            <td className="rounded-br-[10px]">{nf1(totalKg)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
