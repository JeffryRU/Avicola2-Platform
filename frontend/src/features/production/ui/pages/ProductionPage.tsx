import { useState, type SyntheticEvent } from 'react'
import { EditToggle } from '@/shared/ui/components/edit-toggle'
import { Loader2, Save, TrendingUp } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import {
  addDays,
  dateOf,
  dDowLongDM,
  dShort,
  recentDayStrip,
  relativeDay,
  today,
  type IsoDate,
  clockTime,
} from '@/shared/domain/dates'
import { nf0, nf1, parseUnits, keepDigits, RECORD_MAX_DIGITS } from '@/shared/domain/format'
import { paths } from '@/app/routes'
import { can, hasTeamView } from '@/shared/domain/session'
import { useRequiredSession } from '@/features/auth'
import { bySubcategory, type Product } from '@/shared/domain/products'
import { useCatalog } from '@/features/catalog'
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
  isEditableDay,
  PRODUCTION_BACK_DAYS,
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
  RECORDED_EMPTY,
  RECORDED_TITLE,
  REGISTERED_LABEL,
  SAVE_LABEL,
  SAVED_MESSAGE,
  STATUS_EDITING,
  STATUS_PENDING,
  STEPS,
  STEPS_END,
  STEPS_TITLE,
  STATUS_SAVED,
  SUMMARY_TITLE,
  UPDATE_LABEL,
  WEIGHTS_HINT,
  WEIGHTS_TITLE,
  qualityError,
  weightError,
} from '@/features/production/types/production'
import { FORECAST_NAV_LABEL } from '@/features/production/types/forecast'
import { useProduction, useRegisterProduction } from '@/features/production/ui/hooks'
import { DayStrip } from '@/shared/ui/components/day-strip'
import { EmptyState, StatusDot } from '@/shared/ui/components/feedback'
import { SyncStatus } from '@/shared/ui/components/sync-status'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'
import { readOnlyDayLabel } from '@/shared/types/daily-record'

const FORM_ID = 'production-form'
/** Angosto: el nombre arriba y las tres cifras debajo. Ancho: todo en una fila. */
const rowCls =
  'grid grid-cols-3 items-center gap-x-2 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)_5rem] sm:gap-x-3'
const nameCls = 'col-span-3 min-w-0 sm:col-span-1'
const cellCls =
  'num h-touch w-full min-w-0 rounded-sm border-control border-input bg-surface px-2 text-right text-md text-foreground outline-none transition-colors placeholder:text-faint focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring dsk:h-9 dsk:text-base'
const splitCls = 'grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_21rem]'
const asideCls = 'grid gap-4 @4xl/main:sticky @4xl/main:top-6'
const pct = (share: number) => `${nf1(share * 100)} %`

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
  // La supervisión solo ve: registra o corrige tras tocar «Editar». El jefe de despacho, siempre.
  const [editing, setEditing] = useState(false)
  const supervision = hasTeamView(session)
  const canManage = can(session, 'manage_production') && (!supervision || editing)
  const toggle =
    supervision && can(session, 'manage_production') ? <EditToggle editing={editing} onChange={setEditing} /> : null
  const { catalog } = useCatalog()
  const ref = today()
  const [day, setDay] = useState<IsoDate>(ref)
  const query = useProduction(addDays(ref, -(HISTORY_DAYS - 1)), ref)
  const days = query.data ?? []
  const record = days.find((d) => d.date === day)
  const products = catalog.products
  const strip = recentDayStrip(day, ref, PRODUCTION_BACK_DAYS)
  const editable = canManage && isEditableDay(day, ref)
  const forecastLink = (
    <Button asChild variant="outline">
      <Link to={paths.forecast}>
        <TrendingUp /> {FORECAST_NAV_LABEL}
      </Link>
    </Button>
  )
  const history = <History days={days} selected={day} onSelect={setDay} pending={query.isPending} />

  return (
    <div>
      <PageHeader
        title={PRODUCTION_TITLE}
        subtitle={canManage ? PRODUCTION_SUBTITLE_MANAGE : PRODUCTION_SUBTITLE_VIEW}
        back={paths.home}
        actions={
          <>
            {toggle}
            {forecastLink}
          </>
        }
        mobileActions={toggle ?? forecastLink}
      />
      <PageBody>
        <DayStrip
          days={strip}
          value={day}
          onChange={setDay}
          label={DAY_LABEL}
          marked={new Set(days.map((d) => d.date))}
          markedLabel={REGISTERED_LABEL}
          caption={(d) => relativeDay(d, ref) ?? undefined}
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
            <Section title={dDowLongDM(day)}>
              {record ? (
                <Rows products={products} read={(id, f) => readValue(record, id, f)} />
              ) : (
                <EmptyState title={NOT_REGISTERED_TITLE}>{NOT_REGISTERED_BODY}</EmptyState>
              )}
            </Section>
            <aside className={asideCls}>
              {record && (
                <Summary
                  totals={totalsOf(record)}
                  record={record}
                  note={canManage ? readOnlyDayLabel(PRODUCTION_BACK_DAYS) : undefined}
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

function readValue(record: ProductionDay, id: string, field: Field): number {
  const line = record.lines.find((l) => l.product_id === id)
  return line ? line[field] : 0
}

function ColumnHead() {
  // En angosto cada campo lleva su etiqueta encima, así que la cabecera solo va en ancho.
  return (
    <div className="hidden sm:block">
      <div
        className={cn(
          rowCls,
          'border-b border-rule-strong px-4 py-2.5 text-xs font-medium text-muted-foreground dsk:px-5 hc:border-b-heavy hc:font-bold hc:text-foreground',
        )}
      >
        <span>{PRODUCT_LABEL}</span>
        {FIELDS.map((f) => (
          <span key={f} className="text-right">
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
    <span className={cn('num', value < 0 && 'text-warn hc:font-bold', !value && 'text-faint')}>
      {value > 0 ? '+' : ''}
      {nf0(value)}
    </span>
  )
}

function GroupHead({ name, ordered, produced }: { name: string | null; ordered: number; produced: number }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-rule bg-muted px-4 py-2 dsk:px-5">
      <b className="eyebrow min-w-0 flex-1 hc:text-foreground">{name ?? 'Otros'}</b>
      <span className="text-sm text-muted-foreground">
        pedido <span className="num">{nf0(ordered)}</span> · llegó{' '}
        <b className="num font-medium text-foreground">{nf0(produced)}</b>
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
    <div className="pb-1">
      <ColumnHead />
      <div className="grid">
        {bySubcategory(products).map((g) => (
          <div key={g.name ?? '-'}>
            <GroupHead
              name={g.name}
              ordered={g.products.reduce((s, p) => s + read(p.id, 'ordered'), 0)}
              produced={g.products.reduce((s, p) => s + read(p.id, 'produced'), 0)}
            />
            {g.products.map((p) => (
              <div key={p.id} className={cn(rowCls, 'border-b border-rule px-4 py-2.5 last:border-0 dsk:px-5')}>
                <span className={cn(nameCls, 'flex items-baseline gap-2')}>
                  <b className="min-w-0 flex-1 truncate font-medium">{p.name}</b>
                  <small className="text-xs text-muted-foreground sm:hidden">
                    desv. <Deviation value={read(p.id, 'produced') - read(p.id, 'ordered')} />
                  </small>
                </span>
                {FIELDS.map((f) => (
                  <span key={f} className="min-w-0">
                    <small className="mb-0.5 block text-right text-2xs text-muted-foreground sm:hidden">
                      {FIELD_SHORT[f]}
                    </small>
                    {cell ? (
                      cell(p, f)
                    ) : (
                      <span
                        className={cn(
                          'num block text-right text-base',
                          f === 'produced' && 'font-semibold',
                          !read(p.id, f) && 'text-faint',
                        )}
                      >
                        {nf0(read(p.id, f))}
                      </span>
                    )}
                  </span>
                ))}
                <span className="hidden text-right text-base sm:block">
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
  const tone = dirty ? 'warn' : record ? 'ok' : 'draft'
  const stat = (label: string, value: React.ReactNode, warn = false) => (
    <div className="flex flex-col-reverse bg-surface px-4 py-3 dsk:px-5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('num text-lg font-medium hc:font-bold', warn && 'text-warn')}>{value}</dd>
    </div>
  )
  return (
    <Section
      title={SUMMARY_TITLE}
      aside={
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-sm',
            tone === 'warn' && 'font-medium text-warn hc:font-bold',
            tone === 'ok' && 'text-foreground',
          )}
        >
          <StatusDot tone={tone} />
          {status}
        </span>
      }
    >
      <div className="px-4 py-4 dsk:px-5">
        <b className="num block text-3xl leading-none font-medium hc:font-extrabold">{nf0(t.produced)}</b>
        <small className="mt-1.5 block text-sm text-muted-foreground">aves que llegaron</small>
      </div>
      <dl className="grid grid-cols-3 gap-px border-t border-rule bg-rule">
        {stat('pedidas', nf0(t.ordered))}
        {stat('diferencia', `${diff.birds > 0 ? '+' : ''}${nf0(diff.birds)}`, diff.birds < 0)}
        {stat('calidad B', pct(t.bShare))}
      </dl>
      {(record ?? note) && (
        <div className="border-t border-rule px-4 py-3 text-sm text-muted-foreground dsk:px-5">
          {record && (
            <p>
              Registró <b className="font-medium text-foreground">{record.recorded_by}</b> ·{' '}
              {dShort(dateOf(record.recorded_at))}, {clockTime(record.recorded_at)}
            </p>
          )}
          {record && Object.keys(record.weights).length > 0 && (
            <p className="mt-1">
              Peso promedio:{' '}
              {Object.entries(record.weights)
                .map(([group, kg]) => `${group} ${String(kg)} kg`)
                .join(' · ')}
            </p>
          )}
          {note && <p className="mt-1">{note}</p>}
        </div>
      )}
      {action}
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
                  <small className="block truncate text-xs text-muted-foreground">pedido {nf0(d.ordered)}</small>
                </span>
                <span className="num text-right">
                  <b className="block text-base font-medium">{nf0(d.produced)}</b>
                  <small className="block text-xs text-muted-foreground">
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
  const stepsList = (
    <ol aria-label={STEPS_TITLE} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-3 dsk:px-5">
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex min-w-0 gap-2">
          <span
            aria-hidden
            className="num grid size-5 flex-none place-items-center rounded-full bg-primary text-2xs font-semibold text-primary-foreground"
          >
            {i + 1}
          </span>
          <span className="min-w-0 text-muted-foreground">
            <b className="font-medium text-foreground">{s.title}.</b> {s.body}
          </span>
        </li>
      ))}
    </ol>
  )
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
    <Button type="submit" form={FORM_ID} disabled={register.isPending} className={className}>
      {register.isPending ? <Loader2 className="animate-spin" /> : <Save />} {record ? UPDATE_LABEL : SAVE_LABEL}
    </Button>
  )
  const alert = error && (
    <p role="alert" className="text-sm font-medium text-bad">
      {error}
    </p>
  )

  return (
    <>
      <div className={splitCls}>
        <Section title={dDowLongDM(day)}>
          <form id={FORM_ID} onSubmit={submit} noValidate>
            <details className="group border-b border-rule bg-muted/50 sm:hidden">
              <summary className="flex min-h-touch cursor-pointer items-center justify-between px-4 text-sm font-medium">
                {STEPS_TITLE}
                <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <div className="pb-3">{stepsList}</div>
            </details>
            <div className="hidden border-b border-rule bg-muted/50 sm:block">{stepsList}</div>
            <Rows
              products={products}
              read={read}
              cell={(p, f) => (
                <input
                  inputMode="numeric"
                  aria-label={`${FIELD_LABEL[f]} de ${p.name}`}
                  aria-invalid={
                    f === 'quality_b' && read(p.id, 'quality_b') > read(p.id, 'produced') ? true : undefined
                  }
                  placeholder="0"
                  value={draft[p.id]?.[f] ?? ''}
                  onChange={(e) => set(p.id, f, keepDigits(e.target.value, RECORD_MAX_DIGITS))}
                  className={cn(
                    cellCls,
                    f === 'produced' && 'font-semibold',
                    f === 'quality_b' && read(p.id, 'quality_b') > read(p.id, 'produced') && 'border-bad text-bad',
                  )}
                />
              )}
            />
            <p className="px-4 py-3 text-sm text-muted-foreground dsk:px-5">
              {HINT} {DEVIATION_HINT} {STEPS_END}
            </p>
            {groups.length > 0 && (
              <fieldset className="border-t border-rule px-4 pt-3 pb-4 dsk:px-5">
                <legend className="sr-only">{WEIGHTS_TITLE}</legend>
                <p aria-hidden className="mb-2 text-sm font-semibold">
                  {WEIGHTS_TITLE}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {groups.map((g) => (
                    <label key={g} className="block min-w-0">
                      <span className="mb-1 block truncate text-xs font-medium text-ink-2">{g}</span>
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
                <p className="mt-2 text-xs text-muted-foreground">{WEIGHTS_HINT}</p>
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
              <div className="hidden gap-2 border-t border-rule px-4 py-3 dsk:px-5 @4xl/main:grid">
                {alert}
                {save('w-full')}
              </div>
            }
          />
          {history}
        </aside>
      </div>
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-4 border-t border-border bg-surface px-4 py-3 dsk:bottom-0 dsk:mx-0 @4xl/main:hidden hc:border-t-heavy hc:border-foreground">
        {alert && <div className="pb-2">{alert}</div>}
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <b className="num block text-lg leading-tight font-medium hc:font-bold">
              {nf0(t.produced)} <span className="font-sans text-sm font-normal text-muted-foreground">llegaron</span>
            </b>
            <small className="block text-xs text-muted-foreground">
              de <span className="num">{nf0(t.ordered)}</span> pedidas
            </small>
          </span>
          {save('flex-none px-5')}
        </div>
      </div>
    </>
  )
}
