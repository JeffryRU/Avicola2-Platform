import { useState, type SyntheticEvent } from 'react'
import { Check, Loader2, Save, TrendingUp } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { addDays, dDowLong, dShort, formatTime, hhmm, today, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { paths } from '@/app/routes'
import { can } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { bySubcategory } from '@/features/catalog/domain/catalog'
import type { Product } from '@/features/catalog/domain/schemas'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { dateOf } from '@/features/editing/domain/editing'
import {
  FIELDS,
  cleanKg,
  deviation,
  invalidWeights,
  toWeights,
  weightDraftOf,
  type WeightDraft,
  draftOf,
  invalidQuality,
  toEntries,
  totals,
  type Field,
  type ProductionDay,
  type ProductionDraft,
} from '@/features/production/domain/production'
import {
  DAY_LABEL,
  DEVIATION_HINT,
  DEVIATION_LABEL,
  FIELD_LABEL,
  FIELD_SHORT,
  HINT,
  HISTORY_DAYS,
  NOT_REGISTERED_BODY,
  NOT_REGISTERED_TITLE,
  PRODUCT_LABEL,
  PRODUCTION_SUBTITLE_MANAGE,
  PRODUCTION_SUBTITLE_VIEW,
  PRODUCTION_TITLE,
  READ_ONLY_DAY_LABEL,
  RECORDED_EMPTY,
  RECORDED_TITLE,
  REGISTERED_LABEL,
  SAVE_LABEL,
  SAVED_MESSAGE,
  STATUS_EDITING,
  STATUS_PENDING,
  STATUS_SAVED,
  SUMMARY_TITLE,
  TODAY_LABEL,
  UPDATE_LABEL,
  WEIGHTS_HINT,
  WEIGHTS_TITLE,
  YESTERDAY_LABEL,
  qualityError,
  weightError,
} from '@/features/production/types/production'
import { FORECAST_NAV_LABEL } from '@/features/production/types/forecast'
import { useProduction, useRegisterProduction } from '@/features/production/ui/hooks'
import { editableDays, isEditableDay, parseUnits } from '@/features/stock/domain/stock'
import { DayStrip } from '@/shared/ui/components/day-strip'
import { EmptyState } from '@/shared/ui/components/feedback'
import { SyncStatus } from '@/shared/ui/components/sync-status'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'

const FORM_ID = 'production-form'
/** Angosto: el nombre arriba y las tres cifras debajo. Ancho: todo en una fila. */
const rowCls =
  'grid grid-cols-3 items-center gap-x-2 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)_5rem] sm:gap-x-3'
const nameCls = 'col-span-3 min-w-0 sm:col-span-1'
const cellCls =
  'h-11 w-full min-w-0 rounded-[10px] border-[1.5px] border-border bg-white px-2 text-center text-[15px] tabular-nums outline-none transition-colors placeholder:text-faint focus:border-primary focus:ring-4 focus:ring-primary-ring'
const splitCls = 'grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_340px]'
const asideCls = 'grid gap-4 @4xl/main:sticky @4xl/main:top-6'
const pct = (share: number) => `${nf1(share * 100)} %`
const dayTitle = (day: IsoDate) => `${dDowLong(day)} ${dShort(day).split(' ')[1]}`

type Totals = ReturnType<typeof totals>
const totalsOf = (d: ProductionDay): Totals => ({
  ordered: d.ordered,
  produced: d.produced,
  qualityB: d.quality_b,
  bShare: d.produced ? d.quality_b / d.produced : 0,
})

/** Producción diaria: el jefe de despacho la registra; el supervisor la consulta. */
export function ProductionPage() {
  const session = useRequiredSession()
  const canManage = can(session, 'manage_production')
  const { catalog } = useCatalog()
  const ref = today()
  const [day, setDay] = useState<IsoDate>(ref)
  const query = useProduction(addDays(ref, -(HISTORY_DAYS - 1)), ref)
  const days = query.data ?? []
  const record = days.find((d) => d.date === day)
  const products = catalog.products
  const strip = editableDays(ref).includes(day) ? editableDays(ref) : [...editableDays(ref), day]
  const editable = canManage && isEditableDay(day, ref)
  const forecastLink = (
    <Link
      to={paths.forecast}
      className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-secondary px-3 text-[13.5px] font-bold text-primary"
    >
      <TrendingUp className="size-4" /> {FORECAST_NAV_LABEL}
    </Link>
  )
  const history = <History days={days} selected={day} onSelect={setDay} pending={query.isPending} />

  return (
    <div>
      <PageHeader
        title={PRODUCTION_TITLE}
        subtitle={canManage ? PRODUCTION_SUBTITLE_MANAGE : PRODUCTION_SUBTITLE_VIEW}
        back={paths.home}
        actions={forecastLink}
        mobileActions={forecastLink}
      />
      <PageBody>
        <DayStrip
          days={strip}
          value={day}
          onChange={setDay}
          label={DAY_LABEL}
          marked={new Set(days.map((d) => d.date))}
          markedLabel={REGISTERED_LABEL}
          caption={(d) => (d === ref ? TODAY_LABEL : d === addDays(ref, -1) ? YESTERDAY_LABEL : undefined)}
        />
        <SyncStatus queries={[query]} />
        {editable ? (
          <Editor
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
                <Rows products={products} read={(id, f) => readValue(record, id, f)} />
              ) : (
                <EmptyState title={NOT_REGISTERED_TITLE}>{NOT_REGISTERED_BODY}</EmptyState>
              )}
            </Section>
            <aside className={asideCls}>
              {record && (
                <Summary totals={totalsOf(record)} record={record} note={canManage ? READ_ONLY_DAY_LABEL : undefined} />
              )}
              {history}
            </aside>
          </div>
        )}
      </PageBody>
    </div>
  )
}

function readValue(record: ProductionDay, id: string, field: Field): number {
  const line = record.lines.find((l) => l.product_id === id)
  return line ? line[field] : 0
}

function ColumnHead() {
  // En angosto cada campo lleva su etiqueta encima, así que la cabecera solo va en ancho.
  return (
    <div className="hidden sm:block">
      <div
        className={cn(rowCls, 'px-3 pb-1.5 text-[12px] font-bold tracking-[0.04em] text-muted-foreground uppercase')}
      >
        <span>{PRODUCT_LABEL}</span>
        {FIELDS.map((f) => (
          <span key={f} className="text-center">
            {FIELD_LABEL[f]}
          </span>
        ))}
        <span className="text-right">{DEVIATION_LABEL}</span>
      </div>
    </div>
  )
}

/** Lo que llegó menos lo pedido, con signo. */
function Deviation({ value }: { value: number }) {
  return (
    <span className={cn(value < 0 && 'text-warn', !value && 'text-faint')}>
      {value > 0 ? '+' : ''}
      {nf0(value)}
    </span>
  )
}

function GroupHead({ name, ordered, produced }: { name: string | null; ordered: number; produced: number }) {
  return (
    <div className="flex items-baseline gap-3 rounded-[10px] bg-muted/70 px-3 py-2">
      <b className="min-w-0 flex-1 text-[13px] tracking-[0.02em] text-ink-2 uppercase">{name ?? 'Otros'}</b>
      <span className="text-[13px] text-muted-foreground tabular-nums">
        pedido {nf0(ordered)} · llegó <b className="text-foreground">{nf0(produced)}</b>
      </span>
    </div>
  )
}

/** Filas agrupadas por tamaño. `read` da el valor de cada celda; `cell` la dibuja (texto o campo). */
function Rows({
  products,
  read,
  cell,
}: {
  products: Product[]
  read: (id: string, field: Field) => number
  cell?: (product: Product, field: Field) => React.ReactNode
}) {
  return (
    <div className="px-3 pt-2 pb-4 dsk:px-4">
      <ColumnHead />
      <div className="grid gap-3">
        {bySubcategory(products).map((g) => (
          <div key={g.name ?? '-'}>
            <GroupHead
              name={g.name}
              ordered={g.products.reduce((s, p) => s + read(p.id, 'ordered'), 0)}
              produced={g.products.reduce((s, p) => s + read(p.id, 'produced'), 0)}
            />
            {g.products.map((p) => (
              <div key={p.id} className={cn(rowCls, 'border-b border-muted px-3 py-2.5 last:border-0')}>
                <span className={cn(nameCls, 'flex items-baseline gap-2')}>
                  <b className="min-w-0 flex-1 truncate text-[15px]">{p.name}</b>
                  <small className="text-[12.5px] text-muted-foreground tabular-nums sm:hidden">
                    desv. <Deviation value={read(p.id, 'produced') - read(p.id, 'ordered')} />
                  </small>
                </span>
                {FIELDS.map((f) => (
                  <span key={f} className="min-w-0">
                    <small className="mb-0.5 block text-center text-[11px] font-semibold text-muted-foreground uppercase sm:hidden">
                      {FIELD_SHORT[f]}
                    </small>
                    {cell ? (
                      cell(p, f)
                    ) : (
                      <span
                        className={cn(
                          'block text-center text-[15px] tabular-nums',
                          f === 'produced' && 'font-bold',
                          !read(p.id, f) && 'text-faint',
                        )}
                      >
                        {nf0(read(p.id, f))}
                      </span>
                    )}
                  </span>
                ))}
                <span className="hidden text-right text-[14.5px] tabular-nums sm:block">
                  <Deviation value={read(p.id, 'produced') - read(p.id, 'ordered')} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Summary({
  totals: t,
  record,
  dirty = false,
  note,
  action,
}: {
  totals: Totals
  record?: ProductionDay
  dirty?: boolean
  note?: string
  action?: React.ReactNode
}) {
  const diff = deviation(t.ordered, t.produced)
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
            {nf0(t.produced)}
          </b>
          <small className="mt-1 block text-[13px] text-muted-foreground">aves que llegaron</small>
        </div>
        <dl className="mt-3.5 grid grid-cols-3 gap-2 border-t border-muted pt-3 text-[13px]">
          <div>
            <dd className="text-[16px] font-extrabold tabular-nums">{nf0(t.ordered)}</dd>
            <dt className="text-muted-foreground">pedidas</dt>
          </div>
          <div>
            <dd className={cn('text-[16px] font-extrabold tabular-nums', diff.birds < 0 && 'text-warn')}>
              {diff.birds > 0 ? '+' : ''}
              {nf0(diff.birds)}
            </dd>
            <dt className="text-muted-foreground">diferencia</dt>
          </div>
          <div>
            <dd className="text-[16px] font-extrabold tabular-nums">{pct(t.bShare)}</dd>
            <dt className="text-muted-foreground">calidad B</dt>
          </div>
        </dl>
        {record && (
          <p className="mt-3 border-t border-muted pt-3 text-[13px] text-muted-foreground">
            Registró <b className="text-foreground">{record.recorded_by}</b> · {dShort(dateOf(record.recorded_at))},{' '}
            {formatTime(hhmm(record.recorded_at))}
          </p>
        )}
        {record && Object.keys(record.weights).length > 0 && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            Peso promedio:{' '}
            {Object.entries(record.weights)
              .map(([group, kg]) => `${group} ${String(kg)} kg`)
              .join(' · ')}
          </p>
        )}
        {note && <p className="mt-2 text-[13px] text-muted-foreground">{note}</p>}
        {action}
      </div>
    </Section>
  )
}

function History({
  days,
  selected,
  onSelect,
  pending,
}: {
  days: ProductionDay[]
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
                  <small className="block truncate text-[12.5px] text-muted-foreground">pedido {nf0(d.ordered)}</small>
                </span>
                <span className="text-right tabular-nums">
                  <b className="block text-[14.5px]">{nf0(d.produced)}</b>
                  <small className="block text-[12.5px] text-muted-foreground">
                    B {pct(d.produced ? d.quality_b / d.produced : 0)}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Editor({
  day,
  products,
  record,
  history,
}: {
  day: IsoDate
  products: Product[]
  record?: ProductionDay
  history: React.ReactNode
}) {
  const register = useRegisterProduction()
  const [initial] = useState<ProductionDraft>(() => draftOf(products, record))
  const [draft, setDraft] = useState<ProductionDraft>(initial)
  const [error, setError] = useState<string | null>(null)
  const groups = bySubcategory(products).flatMap((g) => (g.name ? [g.name] : []))
  const [initialWeights] = useState<WeightDraft>(() => weightDraftOf(groups, record?.weights))
  const [weights, setWeights] = useState<WeightDraft>(initialWeights)
  const t = totals(products, draft)
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) || JSON.stringify(weights) !== JSON.stringify(initialWeights)
  const read = (id: string, field: Field) => parseUnits(draft[id]?.[field] ?? '') ?? 0
  const set = (id: string, field: Field, value: string) =>
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { ordered: '', produced: '', quality_b: '' }), [field]: value } }))

  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const bad = invalidQuality(products, draft)
    if (bad.length) {
      setError(qualityError(bad.map((p) => p.name)))
      return
    }
    const badWeights = invalidWeights(weights)
    if (badWeights.length) {
      setError(weightError(badWeights))
      return
    }
    setError(null)
    register.mutate(
      { day, lines: toEntries(products, draft), weights: toWeights(weights) },
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
          <form id={FORM_ID} onSubmit={submit} noValidate>
            <Rows
              products={products}
              read={read}
              cell={(p, f) => (
                <input
                  inputMode="numeric"
                  aria-label={`${FIELD_LABEL[f]} de ${p.name}`}
                  placeholder="0"
                  value={draft[p.id]?.[f] ?? ''}
                  onChange={(e) => set(p.id, f, e.target.value.replace(/\D/g, '').slice(0, 7))}
                  className={cn(cellCls, f === 'produced' && 'font-bold')}
                />
              )}
            />
            <p className="px-6 pb-3 text-[13px] text-muted-foreground dsk:px-7">
              {HINT} {DEVIATION_HINT}
            </p>
            {groups.length > 0 && (
              <fieldset className="mx-3 mb-4 rounded-[12px] border border-muted px-3 pt-2 pb-3 dsk:mx-4">
                <legend className="px-1 text-[13px] font-bold text-ink-2">{WEIGHTS_TITLE}</legend>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {groups.map((g) => (
                    <label key={g} className="block min-w-0">
                      <span className="mb-1 block truncate text-[12.5px] font-semibold text-muted-foreground">{g}</span>
                      <input
                        inputMode="decimal"
                        placeholder="—"
                        aria-label={`Peso promedio de ${g}`}
                        value={weights[g] ?? ''}
                        onChange={(e) => {
                          const clean = cleanKg(e.target.value)
                          if (clean !== null) setWeights((w) => ({ ...w, [g]: clean }))
                        }}
                        className={cellCls}
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[12.5px] text-muted-foreground">{WEIGHTS_HINT}</p>
              </fieldset>
            )}
          </form>
        </Section>
        <aside className={asideCls}>
          <Summary
            totals={t}
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
      <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 mt-4 rounded-[16px] border bg-white/95 p-3 shadow-card backdrop-blur-md dsk:bottom-4 @4xl/main:hidden">
        {alert && <div className="px-1 pb-2">{alert}</div>}
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 pl-1 tabular-nums">
            <b className="block text-[17px] leading-tight">
              {nf0(t.produced)} <span className="text-[13px] font-semibold text-muted-foreground">llegaron</span>
            </b>
            <small className="block text-[12.5px] text-muted-foreground">de {nf0(t.ordered)} pedidas</small>
          </span>
          {save('flex-none px-5')}
        </div>
      </div>
    </>
  )
}
