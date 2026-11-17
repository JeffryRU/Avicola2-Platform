import { Fragment } from 'react'
import { Wand2 } from 'lucide-react'
import { dShort, relativeDay, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1, parseCell } from '@/shared/domain/format'
import { bySubcategory, type Product, type Units } from '@/shared/domain/products'
import type { Draft } from '@/features/projections/domain/draft'
import { cn } from '@/shared/ui/lib/utils'
import { kgPerUnitLabel } from '@/features/catalog'
import { kgAmount } from '@/shared/types/labels'

interface Props {
  draft: Draft
  dates: IsoDate[]
  products: Product[]
  invalid: IsoDate[]
  mobile: boolean
  onChange: (date: IsoDate, productId: string, units: number | null) => void
  /** Sugerencia del modelo por día: se muestra junto a cada casilla y se usa al tocarla. */
  suggested?: Partial<Record<IsoDate, Units>>
  /** Llena solo ese día con la sugerencia (botón sobre cada día). */
  onFillDay?: (date: IsoDate) => void
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
export function ProjectionMatrix({ draft, dates, products, invalid, mobile, onChange, suggested, onFillDay }: Props) {
  const value = (d: IsoDate, p: Product) => draft.units[d]?.[p.id]
  const hintOf = (d: IsoDate, p: Product) => suggested?.[d]?.[p.id] ?? 0
  const daySuggested = (d: IsoDate) => products.some((p) => hintOf(d, p) > 0)
  // Número sugerido por el modelo junto a la casilla: tocarlo lo usa. Fuera del Tab (la tabla se
  // recorre como hoja de cálculo); con teclado se usa «Llenar» del día.
  const hint = (d: IsoDate, p: Product) => {
    const s = hintOf(d, p)
    if (!s) return null
    return (
      <button
        type="button"
        tabIndex={-1}
        title="Sugerencia del modelo: tócala para usarla"
        aria-label={`Usar la sugerencia: ${nf0(s)} de ${p.name}, ${dShort(d)}`}
        onClick={() => onChange(d, p.id, s)}
        className={cn(
          'num hover:bg-primary/10 rounded px-1 text-xs font-medium text-primary/80 transition-colors hover:text-primary hc:text-primary hc:underline',
          value(d, p) === s && 'text-faint',
        )}
      >
        {nf0(s)}
      </button>
    )
  }
  // Totales de los productos a la vista (con un tamaño elegido, solo los suyos).
  const dayUnits = (d: IsoDate) => products.reduce((s, p) => s + (value(d, p) ?? 0), 0)
  const dayKg = (d: IsoDate) => products.reduce((s, p) => s + (value(d, p) ?? 0) * p.kg_per_unit, 0)
  const productUnits = (p: Product) => dates.reduce((s, d) => s + (value(d, p) ?? 0), 0)
  const totalUnits = dates.reduce((s, d) => s + dayUnits(d), 0)
  const totalKg = dates.reduce((s, d) => s + dayKg(d), 0)
  // Subcategorías (Brasa chica, mediana, grande): una fila de encabezado con su subtotal por día.
  const groups = bySubcategory(products)
  const grouped = groups.length > 1
  const groupUnits = (d: IsoDate, ps: Product[]) => ps.reduce((s, p) => s + (value(d, p) ?? 0), 0)
  const groupKg = (d: IsoDate, ps: Product[]) => ps.reduce((s, p) => s + (value(d, p) ?? 0) * p.kg_per_unit, 0)
  const groupCls = '[&>td]:bg-muted [&>td]:text-xs [&>td]:font-semibold [&>td]:text-ink-2'

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
            'num rounded-md border-control border-input bg-surface text-center font-medium text-foreground transition-colors placeholder:text-faint focus-visible:border-ring',
            mobile ? 'h-touch w-14 text-md' : 'h-9 w-16 text-base',
            invalid.includes(d) && 'border-bad bg-bad-soft',
          )}
        />
        {mobile && (
          <small className="num mt-0.5 block text-xs whitespace-nowrap text-muted-foreground">
            {v ? kgAmount(v * p.kg_per_unit) : (hint(d, p) ?? ' ')}
          </small>
        )}
      </>
    )
  }
  const deskCell = (d: IsoDate, p: Product) => (
    <div className="flex items-center justify-center gap-1">
      {cell(d, p)}
      {suggested && <span className="inline-flex w-8 justify-start">{hint(d, p)}</span>}
    </div>
  )

  const th =
    'border-b border-rule-strong bg-surface px-2 py-2 text-center text-xs font-medium whitespace-nowrap text-muted-foreground hc:border-b-heavy hc:border-foreground hc:text-sm hc:font-bold hc:text-foreground'
  const head = (d: IsoDate) => (
    <>
      {onFillDay && (
        <button
          type="button"
          onClick={() => onFillDay(d)}
          disabled={!daySuggested(d)}
          title={daySuggested(d) ? 'Llenar este día con la sugerencia del modelo' : 'Sin sugerencia para este día'}
          aria-label={`Llenar ${dShort(d)} con la sugerencia`}
          className="hover:bg-primary/10 mx-auto mb-1 flex min-h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-primary transition-colors disabled:pointer-events-none disabled:opacity-40 hc:border-foreground"
        >
          <Wand2 aria-hidden className="size-3.5" /> Llenar
        </button>
      )}
      <span className="block text-sm font-semibold text-foreground">{dShort(d)}</span>
      <small className="block text-xs font-medium text-primary">{relativeDay(d) ?? ' '}</small>
    </>
  )

  if (mobile) {
    const stk = 'sticky left-0 z-[2] min-w-24 max-w-28 border-r border-rule bg-surface pl-3 text-left'
    return (
      <div className="panel overflow-hidden">
        <div className="relative overflow-x-auto overscroll-x-contain">
          <table id="mx" className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={cn(th, stk, 'z-[3] text-left')}>
                  <span className="block text-sm font-semibold text-foreground">Producto</span>
                  <small className="block text-xs">Presentación</small>
                </th>
                {dates.map((d) => (
                  <th key={d} className={cn(th, invalid.includes(d) && '[&>span]:text-bad')}>
                    {head(d)}
                  </th>
                ))}
                <th className={cn(th, 'pr-3')}>
                  <span className="block text-sm font-semibold text-foreground">Total</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.name ?? ''}>
                  {grouped && (
                    <tr className={cn(groupCls, '[&>td]:py-1.5 [&>td]:text-center [&>td:first-child]:text-left')}>
                      <td className={cn(stk, '!bg-muted')}>{g.name ?? 'Otros'}</td>
                      {dates.map((d) => (
                        <td key={d} className="num">
                          {nf0(groupUnits(d, g.products))}
                        </td>
                      ))}
                      <td className="num pr-3">{nf0(dates.reduce((s, d) => s + groupUnits(d, g.products), 0))}</td>
                    </tr>
                  )}
                  {g.products.map((p) => (
                    <tr key={p.id}>
                      <td className={cn(stk, 'border-b border-b-rule py-2')}>
                        <span className="block text-sm font-medium">{p.name}</span>
                        <small className="text-xs text-muted-foreground">{kgPerUnitLabel(p.kg_per_unit)}</small>
                      </td>
                      {dates.map((d) => (
                        <td key={d} className="min-w-16 border-b border-rule px-1 py-2 text-center">
                          {cell(d, p)}
                        </td>
                      ))}
                      <td className="min-w-16 border-b border-rule pr-3 text-center">
                        <b className="num text-sm font-semibold">{nf0(productUnits(p))}</b>
                        <small className="num block text-xs text-muted-foreground">
                          {kgAmount(
                            productUnits(p) && dates.reduce((s, d) => s + (value(d, p) ?? 0) * p.kg_per_unit, 0),
                          )}
                        </small>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="[&>td]:border-t [&>td]:border-rule-strong [&>td]:bg-muted [&>td]:py-2.5 [&>td]:text-center [&>td]:font-semibold hc:[&>td]:border-t-heavy hc:[&>td]:border-foreground">
                <td className={cn(stk, '!bg-muted text-sm')}>Total por día</td>
                {dates.map((d) => (
                  <td key={d}>
                    <b className="num text-sm font-semibold">{nf0(dayUnits(d))}</b>
                    <small className="num block text-xs font-normal text-ink-2">{kgAmount(dayKg(d))}</small>
                  </td>
                ))}
                <td className="pr-3">
                  <b className="num text-sm font-semibold" data-testid="grand-units">
                    {nf0(totalUnits)}
                  </b>
                  <small className="num block text-xs font-normal text-ink-2">{kgAmount(totalKg)}</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="panel relative overflow-x-auto">
      <table id="mx" className="w-full border-separate border-spacing-0 text-base">
        <thead>
          <tr>
            <th rowSpan={2} className={cn(th, 'pl-5 text-left')}>
              <span className="block text-sm font-semibold text-foreground">Producto</span>
              <small className="text-xs">Presentación</small>
            </th>
            {dates.map((d) => (
              <th key={d} colSpan={2} className={cn(th, 'border-b-rule', invalid.includes(d) && '[&>span]:text-bad')}>
                {head(d)}
              </th>
            ))}
            <th colSpan={2} className={cn(th, 'border-b-rule pr-5')}>
              <span className="block text-sm font-semibold text-foreground">Total producto</span>
            </th>
          </tr>
          <tr className="[&>th]:border-b [&>th]:border-rule-strong [&>th]:px-2 [&>th]:py-1 [&>th]:text-xs [&>th]:font-medium [&>th]:text-muted-foreground hc:[&>th]:border-b-heavy hc:[&>th]:border-foreground">
            {dates.map((d) => [<th key={`${d}u`}>Unid.</th>, <th key={`${d}k`}>Kg</th>])}
            <th>Unid.</th>
            <th className="pr-5">Kg</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.name ?? ''}>
              {grouped && (
                <tr
                  className={cn(
                    groupCls,
                    '[&>td]:px-2 [&>td]:py-1.5 [&>td]:text-center [&>td:first-child]:pl-5 [&>td:first-child]:text-left [&>td:last-child]:pr-5',
                  )}
                >
                  <td>{g.name ?? 'Otros'}</td>
                  {dates.map((d) => [
                    <td key={`${d}u`} className="num">
                      {nf0(groupUnits(d, g.products))}
                    </td>,
                    <td key={`${d}k`} className="num">
                      {nf1(groupKg(d, g.products))}
                    </td>,
                  ])}
                  <td className="num">{nf0(dates.reduce((s, d) => s + groupUnits(d, g.products), 0))}</td>
                  <td className="num">{nf1(dates.reduce((s, d) => s + groupKg(d, g.products), 0))}</td>
                </tr>
              )}
              {g.products.map((p) => (
                <tr
                  key={p.id}
                  className="[&>td]:border-b [&>td]:border-rule [&>td]:px-2 [&>td]:py-1.5 [&>td]:text-center [&>td:first-child]:pl-5 [&>td:first-child]:text-left [&>td:last-child]:pr-5"
                >
                  <td className="whitespace-nowrap">
                    <span className="block font-medium">{p.name}</span>
                    <small className="text-xs text-muted-foreground">{kgPerUnitLabel(p.kg_per_unit)}</small>
                  </td>
                  {dates.map((d) => [
                    <td key={`${d}u`}>{deskCell(d, p)}</td>,
                    <td
                      key={`${d}k`}
                      className={cn('num min-w-14 text-sm text-muted-foreground', !value(d, p) && 'text-faint')}
                    >
                      {value(d, p) ? nf1((value(d, p) ?? 0) * p.kg_per_unit) : '—'}
                    </td>,
                  ])}
                  <td className="num font-semibold">{nf0(productUnits(p))}</td>
                  <td className="num text-ink-2">
                    {nf1(dates.reduce((s, d) => s + (value(d, p) ?? 0) * p.kg_per_unit, 0))}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr className="[&>td]:border-t [&>td]:border-rule-strong [&>td]:bg-muted [&>td]:px-2 [&>td]:py-2.5 [&>td]:text-center [&>td]:font-semibold hc:[&>td]:border-t-heavy hc:[&>td]:border-foreground [&>td:first-child]:pl-5 [&>td:first-child]:text-left [&>td:last-child]:pr-5">
            <td>Total por día</td>
            {dates.map((d) => [
              <td key={`${d}u`} className="num">
                {nf0(dayUnits(d))}
              </td>,
              <td key={`${d}k`} className="num">
                {nf1(dayKg(d))}
              </td>,
            ])}
            <td className="num" data-testid="grand-units">
              {nf0(totalUnits)}
            </td>
            <td className="num">{nf1(totalKg)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
