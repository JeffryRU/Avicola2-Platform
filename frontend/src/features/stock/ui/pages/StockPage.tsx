import { useState, type SyntheticEvent } from 'react'
import { Check, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { addDays, dDowLong, dShort, formatTime, hhmm, today, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { can, hasTeamView } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { bySubcategory } from '@/features/catalog/domain/catalog'
import type { Product } from '@/features/catalog/domain/schemas'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { dateOf } from '@/features/editing/domain/editing'
import {
  draftOf,
  draftTotals,
  editableDays,
  invalidKg,
  isEditableDay,
  kgOf,
  parseUnits,
  toEntries,
  type StockDay,
  type StockDraft,
} from '@/features/stock/domain/stock'
import {
  COLUMNS,
  DAY_LABEL,
  HISTORY_DAYS,
  INVALID_KG_LABEL,
  KG_HINT,
  NOT_REGISTERED_BODY,
  NOT_REGISTERED_TITLE,
  READ_ONLY_DAY_LABEL,
  RECORDED_EMPTY,
  RECORDED_TITLE,
  REGISTERED_LABEL,
  SAVE_LABEL,
  SAVED_MESSAGE,
  STATUS_EDITING,
  STATUS_PENDING,
  STATUS_SAVED,
  STOCK_SUBTITLE_MANAGE,
  STOCK_SUBTITLE_VIEW,
  STOCK_TITLE,
  SUMMARY_TITLE,
  TODAY_LABEL,
  UPDATE_LABEL,
  YESTERDAY_LABEL,
  unitsLabel,
} from '@/features/stock/types/stock'
import { useRegisterStock, useStock } from '@/features/stock/ui/hooks'
import { DayStrip } from '@/shared/ui/components/day-strip'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'

const FORM_ID = 'stock-form'
const kgText = (n: number) => `${nf1(n)} kg`
/** Producto a la izquierda y dos columnas numéricas; se angosta sin scroll hasta 320 px. */
const rowCls =
  'grid grid-cols-[minmax(0,1fr)_4.5rem_5.25rem] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem] sm:gap-x-4'
const cellCls =
  'h-11 w-full min-w-0 rounded-[10px] border-[1.5px] border-border bg-white px-2 text-center text-[15px] tabular-nums outline-none transition-colors placeholder:text-faint focus:border-primary focus:ring-4 focus:ring-primary-ring'
/** Dos columnas desde ~900 px de contenido: el detalle a la izquierda y el resumen fijo a la derecha. */
const splitCls = 'grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_340px]'
const asideCls = 'grid gap-4 @4xl/main:sticky @4xl/main:top-6'

/** Stock de despacho: el jefe de despacho lo registra por día; el supervisor lo consulta. */
export function StockPage() {
  const session = useRequiredSession()
  const canManage = can(session, 'manage_stock')
  const { catalog } = useCatalog()
  const ref = today()
  const [day, setDay] = useState<IsoDate>(ref)
  const stock = useStock(addDays(ref, -(HISTORY_DAYS - 1)), ref)
  const days = stock.data ?? []
  const record = days.find((d) => d.date === day)
  const products = catalog?.products ?? []
  const registered = new Set(days.map((d) => d.date))
  // La tira muestra los días que se pueden registrar; un día más antiguo se abre desde la lista.
  const strip = editableDays(ref).includes(day) ? editableDays(ref) : [...editableDays(ref), day]
  const editable = canManage && isEditableDay(day, ref)
  const ready = !stock.isPending && !!catalog
  const history = <History days={days} selected={day} onSelect={setDay} pending={stock.isPending} />

  return (
    <div>
      <PageHeader
        title={STOCK_TITLE}
        subtitle={canManage ? STOCK_SUBTITLE_MANAGE : STOCK_SUBTITLE_VIEW}
        back={hasTeamView(session) ? '/' : null}
      />
      <PageBody>
        <DayStrip
          days={strip}
          value={day}
          onChange={setDay}
          label={DAY_LABEL}
          marked={registered}
          markedLabel={REGISTERED_LABEL}
          caption={(d) => (d === ref ? TODAY_LABEL : d === addDays(ref, -1) ? YESTERDAY_LABEL : undefined)}
        />
        {!ready ? null : editable ? (
          <StockEditor
            key={`${day}:${record?.recorded_at ?? ''}`}
            day={day}
            products={products}
            record={record}
            history={history}
          />
        ) : (
          <div className={splitCls}>
            <Section title={dayTitle(day)}>
              {record ? (
                <StockRows products={products} values={valuesOf(record)} />
              ) : (
                <EmptyState title={NOT_REGISTERED_TITLE}>{NOT_REGISTERED_BODY}</EmptyState>
              )}
            </Section>
            <aside className={asideCls}>
              {record && (
                <Summary
                  units={record.total_units}
                  kg={record.total_kg}
                  record={record}
                  note={canManage ? READ_ONLY_DAY_LABEL : undefined}
                />
              )}
              {history}
            </aside>
          </div>
        )}
      </PageBody>
    </div>
  )
}

const dayTitle = (day: IsoDate) => `${dDowLong(day)} ${dShort(day).split(' ')[1]}`

type RowValues = Map<string, { units: number; kg: number }>
const valuesOf = (record: StockDay): RowValues => new Map(record.lines.map((l) => [l.product_id, l]))

/** Cabecera de grupo (Brasa chica...) con su subtotal. */
function GroupHead({ name, units, kg }: { name: string | null; units: number; kg: number }) {
  return (
    <div className="flex items-baseline gap-3 rounded-[10px] bg-muted/70 px-3 py-2">
      <b className="min-w-0 flex-1 text-[13px] tracking-[0.02em] text-ink-2 uppercase">{name ?? 'Otros'}</b>
      <span className="text-[13px] text-muted-foreground tabular-nums">
        <b className="text-foreground">{nf0(units)}</b> unid. · {kgText(kg)}
      </span>
    </div>
  )
}

function ColumnHead() {
  return (
    <div className={cn(rowCls, 'px-3 pb-1.5 text-[12px] font-bold tracking-[0.04em] text-muted-foreground uppercase')}>
      <span>{COLUMNS.product}</span>
      <span className="text-center">
        <span className="sm:hidden">Unid.</span>
        <span className="hidden sm:inline">{COLUMNS.units}</span>
      </span>
      <span className="text-center">{COLUMNS.kg}</span>
    </div>
  )
}

function ProductName({ product }: { product: Product }) {
  return (
    <span className="min-w-0">
      <b className="block truncate text-[15px]">{product.name}</b>
      <small className="block text-[12px] text-muted-foreground tabular-nums">{nf1(product.kg_per_unit)} kg c/u</small>
    </span>
  )
}

/** Stock de un día en solo lectura, agrupado por tamaño. */
function StockRows({ products, values }: { products: Product[]; values: RowValues }) {
  return (
    <div className="px-3 pt-2 pb-4 dsk:px-4">
      <ColumnHead />
      <div className="grid gap-3">
        {bySubcategory(products).map((g) => (
          <div key={g.name ?? '-'}>
            <GroupHead
              name={g.name}
              units={g.products.reduce((s, p) => s + (values.get(p.id)?.units ?? 0), 0)}
              kg={g.products.reduce((s, p) => s + (values.get(p.id)?.kg ?? 0), 0)}
            />
            {g.products.map((p) => {
              const v = values.get(p.id)
              return (
                <div key={p.id} className={cn(rowCls, 'border-b border-muted px-3 py-2.5 last:border-0')}>
                  <ProductName product={p} />
                  <span className={cn('text-center text-[15px] font-bold tabular-nums', !v?.units && 'text-faint')}>
                    {nf0(v?.units ?? 0)}
                  </span>
                  <span className={cn('text-center text-[14px] tabular-nums', !v?.kg && 'text-faint')}>
                    {v?.kg ? nf1(v.kg) : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Totales del día y quién lo registró. */
function Summary({
  units,
  kg,
  record,
  dirty = false,
  note,
  action,
}: {
  units: number
  kg: number
  record?: StockDay
  dirty?: boolean
  note?: string
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
        <div className="mt-3 flex items-end gap-5">
          <div>
            <b className="block text-[34px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
              {nf0(units)}
            </b>
            <small className="mt-1 block text-[13px] text-muted-foreground">{unitsLabel(units)}</small>
          </div>
          <div className="pb-px">
            <b className="block text-[20px] leading-none font-extrabold tabular-nums">{nf1(kg)}</b>
            <small className="mt-1 block text-[13px] text-muted-foreground">kg</small>
          </div>
        </div>
        {record && (
          <p className="mt-3.5 border-t border-muted pt-3 text-[13px] text-muted-foreground">
            Registró <b className="text-foreground">{record.recorded_by}</b> · {dShort(dateOf(record.recorded_at))},{' '}
            {formatTime(hhmm(record.recorded_at))}
          </p>
        )}
        {note && <p className="mt-2 text-[13px] text-muted-foreground">{note}</p>}
        {action}
      </div>
    </Section>
  )
}

/** Últimos días con registro: un toque abre ese día. */
function History({
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
                    {d.recorded_by} · {formatTime(hhmm(d.recorded_at))}
                  </small>
                </span>
                <span className="text-right tabular-nums">
                  <b className="block text-[14.5px]">{nf0(d.total_units)}</b>
                  <small className="block text-[12.5px] text-muted-foreground">{kgText(d.total_kg)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** Formulario del jefe de despacho: unidades y kg por producto, con el total siempre a la vista. */
function StockEditor({
  day,
  products,
  record,
  history,
}: {
  day: IsoDate
  products: Product[]
  record?: StockDay
  history: React.ReactNode
}) {
  const register = useRegisterStock()
  const [initial] = useState<StockDraft>(() => draftOf(products, record))
  const [draft, setDraft] = useState<StockDraft>(initial)
  const [error, setError] = useState<string | null>(null)
  const totals = draftTotals(products, draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const set = (id: string, field: 'units' | 'kg', value: string) =>
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { units: '', kg: '' }), [field]: value } }))

  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (invalidKg(draft)) {
      setError(INVALID_KG_LABEL)
      return
    }
    setError(null)
    register.mutate(
      { day, lines: toEntries(products, draft) },
      { onSuccess: () => toast.success(SAVED_MESSAGE), onError: (err) => setError(err.message) },
    )
  }

  const save = (className: string) => (
    <Button type="submit" form={FORM_ID} disabled={register.isPending} className={cn('h-12 font-bold', className)}>
      {register.isPending ? <Loader2 className="animate-spin" /> : <Save />} {record ? UPDATE_LABEL : SAVE_LABEL}
    </Button>
  )
  const alert = error && (
    <p role="alert" className="text-[13px] font-semibold text-destructive">
      {error}
    </p>
  )

  return (
    <>
      <div className={splitCls}>
        <Section title={dayTitle(day)}>
          <form id={FORM_ID} onSubmit={submit} noValidate className="px-3 pt-2 pb-4 dsk:px-4">
            <ColumnHead />
            <div className="grid gap-3">
              {bySubcategory(products).map((g) => (
                <div key={g.name ?? '-'}>
                  <GroupHead
                    name={g.name}
                    units={g.products.reduce((s, p) => s + (parseUnits(draft[p.id]?.units ?? '') ?? 0), 0)}
                    kg={g.products.reduce((s, p) => s + kgOf(p, draft[p.id]), 0)}
                  />
                  {g.products.map((p) => {
                    const cell = draft[p.id]
                    const estimate = kgOf(p, { units: cell?.units ?? '', kg: '' })
                    return (
                      <div key={p.id} className={cn(rowCls, 'border-b border-muted px-3 py-2 last:border-0')}>
                        <ProductName product={p} />
                        <input
                          inputMode="numeric"
                          aria-label={`${COLUMNS.units} de ${p.name}`}
                          placeholder="0"
                          value={cell?.units ?? ''}
                          onChange={(e) => set(p.id, 'units', e.target.value.replace(/\D/g, '').slice(0, 7))}
                          className={cn(cellCls, 'font-bold')}
                        />
                        <input
                          inputMode="decimal"
                          aria-label={`${COLUMNS.kg} de ${p.name}`}
                          placeholder={estimate ? nf1(estimate) : '—'}
                          value={cell?.kg ?? ''}
                          onChange={(e) => set(p.id, 'kg', e.target.value.replace(/[^\d.,]/g, '').slice(0, 11))}
                          className={cellCls}
                        />
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <p className="px-3 pt-3 text-[13px] text-muted-foreground">{KG_HINT}</p>
          </form>
        </Section>
        <aside className={asideCls}>
          <Summary
            units={totals.units}
            kg={totals.kg}
            record={record}
            dirty={dirty}
            action={
              <div className="mt-4 hidden gap-2 @4xl/main:grid">
                {alert}
                {save('w-full')}
              </div>
            }
          />
          {history}
        </aside>
      </div>
      {/* En pantallas angostas el total y el botón quedan fijos sobre la barra inferior. */}
      <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 mt-4 rounded-[16px] border bg-white/95 p-3 shadow-card backdrop-blur-md dsk:bottom-4 @4xl/main:hidden">
        {alert && <div className="px-1 pb-2">{alert}</div>}
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 pl-1 tabular-nums">
            <b className="block text-[17px] leading-tight">
              {nf0(totals.units)} <span className="text-[13px] font-semibold text-muted-foreground">unid.</span>
            </b>
            <small className="block text-[12.5px] text-muted-foreground">{kgText(totals.kg)}</small>
          </span>
          {save('flex-none px-5')}
        </div>
      </div>
    </>
  )
}
