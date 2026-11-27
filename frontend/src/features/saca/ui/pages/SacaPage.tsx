import { useState, type SyntheticEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { isoDateSchema } from '@/shared/domain/schemas'
import { ArrowRight, History, Pencil } from 'lucide-react'
import { paths } from '@/app/routes'
import { toast } from 'sonner'
import { addDays, clockTime, dDowLong, dShort, today, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { can } from '@/shared/domain/session'
import { useRequiredSession } from '@/features/auth'
import { bySubcategory, type Product } from '@/shared/domain/products'
import { useCatalog } from '@/features/catalog'
import { useSacaPlan, useSetSacaPlus } from '@/features/saca/ui/hooks'
import {
  emptySaca,
  missingSellers,
  parsePlus,
  sacaDays,
  type Saca,
  type SacaGroup,
  type SacaLine,
} from '@/features/saca/domain/saca'
import {
  ARRIVAL_HINT,
  arrivalNote,
  BIRDS_LABEL,
  BY_PRODUCT_TITLE,
  CANCEL,
  COLUMNS,
  coverageText,
  DAY_LABEL,
  EDIT_PLUS_LABEL,
  FARM_COLUMNS,
  FARM_ORDER_HINT,
  FIX_ARRIVAL,
  FIX_PROJECTIONS,
  FIX_STOCK,
  FORMULA,
  groupStockBNote,
  SUGGESTED_PLUS_SHORT,
  suggestedPlusTitle,
  HERO_LABEL,
  HISTORY_LINK,
  savedNote,
  KG_LABEL,
  LIVE_LABEL,
  missingNote,
  NEED_LABEL,
  NO_ARRIVAL,
  NO_ORDERS,
  NO_STOCK,
  NO_STOCK_DATE,
  NOTHING_BODY,
  NOTHING_TITLE,
  ORDERS_OK,
  ordersOf,
  PLUS_INVALID,
  PLUS_SAVED,
  projectionOf,
  SACA_SUBTITLE,
  SACA_TITLE,
  SAVE_PLUS,
  SOURCE,
  SOURCES_TITLE,
  stockAt,
  stockBNote,
  stockOldNote,
  TODAY_LABEL,
  TOMORROW_LABEL,
  WAITING_SOURCES,
} from '@/features/saca/types/saca'
import { modelLabel } from '@/features/production'
import { SyncStatus } from '@/shared/ui/components/sync-status'
import { DayStrip } from '@/shared/ui/components/day-strip'
import { EmptyState, StatusDot } from '@/shared/ui/components/feedback'
import { Button } from '@/shared/ui/components/shadcn/button'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'
import { kgAmount, unitsCount } from '@/shared/types/labels'

/** Supervisor: cuánto pedir a granja para un día, por producto, y con qué datos se calculó. */
export function SacaPage() {
  const { catalog } = useCatalog()
  const ref = today()
  // ?fecha=AAAA-MM-DD abre la saca guardada de ese día (desde el Historial de sacas).
  const [params] = useSearchParams()
  const asked = params.get('fecha')
  const [day, setDay] = useState<IsoDate>(() => (asked && isoDateSchema.safeParse(asked).success ? asked : ref))
  const query = useSacaPlan(day)
  // Sin respuesta del servidor se dibuja la saca en cero; los datos llegan cuando responde.
  const waiting = !query.data
  const plan = query.data ?? emptySaca(day, catalog.products)
  const historyLink = (
    <Button asChild variant="outline">
      <Link to={paths.sacaHistory}>
        <History /> {HISTORY_LINK}
      </Link>
    </Button>
  )

  return (
    <div>
      <PageHeader title={SACA_TITLE} subtitle={SACA_SUBTITLE} actions={historyLink} mobileActions={historyLink} />
      <PageBody>
        <DayStrip
          days={sacaDays(ref)}
          value={day}
          onChange={setDay}
          label={DAY_LABEL}
          caption={(d) => (d === ref ? TODAY_LABEL : d === addDays(ref, 1) ? TOMORROW_LABEL : undefined)}
        />
        <SyncStatus queries={[query]} />
        {plan.saved_at && (
          <p className="mx-1 mb-3 flex items-center gap-1.5 text-sm text-muted-foreground">
            <History aria-hidden className="size-4" /> {savedNote(clockTime(plan.saved_at), plan.saved_by ?? '')}
          </p>
        )}
        {
          // En pantallas anchas: resumen y detalle a la izquierda, datos de origen fijos a la derecha.
          // En angostas se apilan en este orden: resumen, datos de origen, detalle.
          <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_21rem]">
            <Hero plan={plan} />
            {waiting ? (
              <Section title={SOURCES_TITLE} className="@4xl/main:sticky @4xl/main:top-6 @4xl/main:row-span-2">
                <p className="px-4 py-4 text-sm text-muted-foreground dsk:px-5">{WAITING_SOURCES}</p>
              </Section>
            ) : (
              <Sources plan={plan} />
            )}
            <Section title={BY_PRODUCT_TITLE} className="@4xl/main:col-start-1">
              {isEmpty(plan) && !waiting ? (
                <EmptyState title={NOTHING_TITLE}>{NOTHING_BODY}</EmptyState>
              ) : (
                <ByProduct plan={plan} products={catalog.products} />
              )}
            </Section>
          </div>
        }
      </PageBody>
    </div>
  )
}

/** Nada de nada: ni stock, ni pedidos, ni proyección, ni plus (el plus solo ya pide aves). */
const isEmpty = (p: Saca) => p.stock === 0 && p.ordered === 0 && p.projected === 0 && p.farm_order === 0

/** «jueves 12» */
const dayText = (d: IsoDate) => `${dDowLong(d)} ${dShort(d).split(' ')[1] ?? ''}`

/** El número que importa, grande; lo demás, al lado. Superficie neutra: el acento queda para las acciones. */
function Hero({ plan }: { plan: Saca }) {
  const used = [
    plan.stock_date ? stockAt(dayText(plan.stock_date)) : NO_STOCK_DATE,
    ordersOf(dayText(plan.orders_date)),
    projectionOf(dayText(plan.projection_date)),
  ]
  return (
    <section className="panel" aria-label={HERO_LABEL}>
      <div className="px-4 pt-4 pb-4 dsk:px-5">
        <p className="eyebrow hc:text-xs hc:text-foreground">
          {HERO_LABEL} · cálculo del {dayText(plan.date)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{used.join(' · ')}</p>
        <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
          <p className="flex items-baseline gap-2">
            <b className="num text-4xl leading-none font-medium hc:font-extrabold">{nf0(plan.farm_order)}</b>
            <span className="text-md text-ink-2">{BIRDS_LABEL}</span>
          </p>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 pb-0.5">
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-muted-foreground">{NEED_LABEL}</dt>
              <dd className="num text-lg leading-tight font-medium hc:font-bold">{nf0(plan.request)}</dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-muted-foreground">{KG_LABEL}</dt>
              <dd className="num text-lg leading-tight font-medium hc:font-bold">{nf1(plan.request_kg)}</dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-muted-foreground">
                {LIVE_LABEL} · rend. {nf0(plan.yield_factor * 100)} %
              </dt>
              <dd className="num text-lg leading-tight font-medium hc:font-bold">{nf1(plan.live_kg)}</dd>
            </div>
          </dl>
        </div>
      </div>
      {plan.groups.length > 0 && <FarmOrder plan={plan} />}
      <p className="border-t border-rule px-4 py-2.5 text-xs text-muted-foreground dsk:px-5">{FORMULA}</p>
    </section>
  )
}

/** Pedido final por tipo. Los supervisores cambian el plus con el lápiz. */
function FarmOrder({ plan }: { plan: Saca }) {
  const session = useRequiredSession()
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const save = useSetSacaPlus()
  const start = () => {
    setError(null)
    setDraft(Object.fromEntries(plan.groups.map((g) => [g.name, String(g.plus)])))
  }
  const submit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    const plus = draft && parsePlus(draft)
    if (!plus) {
      setError(PLUS_INVALID)
      return
    }
    setError(null)
    save.mutate(plus, {
      onSuccess: () => {
        setDraft(null)
        toast.success(PLUS_SAVED)
      },
      onError: (e) => setError(e.message),
    })
  }
  // Plus sugerido por la calidad B junto al plus: al editar, tocarlo lo usa (INS-14).
  const suggestion = (g: SacaGroup) => {
    // Sin faltante no hay nada que sugerir (como en las proyecciones, el 0 no se muestra).
    if (!g.suggested_plus || g.b_rate === null) return null
    const n = g.suggested_plus
    const title = suggestedPlusTitle(g.b_rate, n, !!draft)
    const text = `${SUGGESTED_PLUS_SHORT} +${nf0(n)}`
    if (!draft)
      return (
        <small className="num block text-2xs text-primary/80" title={title}>
          {text}
        </small>
      )
    return (
      <button
        type="button"
        title={title}
        aria-label={`Usar el plus sugerido de ${g.name}: ${nf0(n)}`}
        onClick={() => setDraft({ ...draft, [g.name]: String(n) })}
        className={cn(
          'num block w-full rounded px-1 text-right text-xs font-medium whitespace-nowrap text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary hc:text-primary hc:underline',
          draft[g.name] === String(n) && 'text-faint',
        )}
      >
        {text}
      </button>
    )
  }
  const plusCell = (name: string, value: number) =>
    draft ? (
      <input
        inputMode="numeric"
        aria-label={`Plus de ${name}`}
        value={draft[name] ?? ''}
        onChange={(e) => setDraft({ ...draft, [name]: e.target.value.replace(/[^\d., ]/g, '').slice(0, 8) })}
        className="num h-touch w-full min-w-0 rounded-sm border-control border-input bg-surface px-2 text-right text-base text-foreground outline-none focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring dsk:h-8"
      />
    ) : (
      <span className="num block text-right">+{nf0(value)}</span>
    )

  return (
    <form onSubmit={submit} className="border-t border-rule px-4 py-3 dsk:px-5">
      {!draft && can(session, 'manage_editing') && (
        <div className="mb-1 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={start} title={EDIT_PLUS_LABEL}>
            <Pencil /> {EDIT_PLUS_LABEL}
          </Button>
        </div>
      )}
      {/* Ancho: tabla en el orden de la fórmula. Angosto: el tipo, la cuenta debajo y lo que se pide. */}
      <div
        className={cn(
          farmCols,
          'hidden border-b border-rule-strong pb-1.5 text-xs font-medium text-muted-foreground sm:grid hc:border-b-heavy hc:font-bold hc:text-foreground',
        )}
      >
        <span>{FARM_COLUMNS.type}</span>
        <span className="text-right">{FARM_COLUMNS.stock}</span>
        <span className="text-right">{FARM_COLUMNS.ordered}</span>
        <span className="text-right">{FARM_COLUMNS.projected}</span>
        <span className="text-right">{FARM_COLUMNS.plus}</span>
        <span className="text-right">{FARM_COLUMNS.order}</span>
      </div>
      {plan.groups.map((g) => (
        <div key={g.name} className="border-t border-rule py-2 text-base first:border-t-0">
          <div className={cn(farmCols, 'hidden sm:grid')}>
            <b className="truncate font-medium">{g.name}</b>
            <span className="num text-right">
              {nf0(g.stock)}
              {g.stock_b > 0 && (
                <small className="block text-2xs text-muted-foreground">{groupStockBNote(g.stock_b)}</small>
              )}
            </span>
            <span className={cn('num text-right', !g.ordered && 'text-faint')}>
              {g.ordered ? `−${nf0(g.ordered)}` : 0}
            </span>
            <span className="num text-right">+{nf0(g.projected)}</span>
            <span className="text-right">
              {plusCell(g.name, g.plus)}
              {suggestion(g)}
            </span>
            <b className="num text-right text-lg font-semibold hc:font-extrabold">{nf0(g.farm_order)}</b>
          </div>
          <div className="sm:hidden">
            <div className="flex items-baseline gap-2">
              <b className="min-w-0 flex-1 truncate font-medium">{g.name}</b>
              <b className="num min-w-10 text-right text-lg font-semibold hc:font-extrabold">{nf0(g.farm_order)}</b>
            </div>
            <div className="num flex items-center gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1">
                {nf0(g.stock)} − {nf0(g.ordered)} + {nf0(g.projected)} {draft ? '+' : `+ ${nf0(g.plus)}`}
                {g.stock_b > 0 && ` · ${groupStockBNote(g.stock_b)}`}
              </span>
              {draft ? (
                <span className="w-24">
                  {plusCell(g.name, g.plus)}
                  {suggestion(g)}
                </span>
              ) : (
                suggestion(g)
              )}
            </div>
          </div>
        </div>
      ))}
      {draft && (
        <>
          {error && (
            <p role="alert" className="pt-1 text-sm font-medium text-bad">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              {CANCEL}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {SAVE_PLUS}
            </Button>
          </div>
        </>
      )}
    </form>
  )
}

const farmCols = 'grid items-baseline gap-x-2 grid-cols-[minmax(7rem,1fr)_repeat(4,minmax(0,4.5rem))_minmax(0,5rem)]'

type Tone = 'ok' | 'warn' | 'off'
const toneDot: Record<Tone, 'ok' | 'warn' | 'draft'> = { ok: 'ok', warn: 'warn', off: 'draft' }

function SourceRow({
  tone,
  label,
  value,
  children,
}: {
  tone: Tone
  label: string
  value?: string
  children?: React.ReactNode
}) {
  return (
    <li className="flex gap-2.5 border-b border-rule py-3 last:border-0">
      <StatusDot tone={toneDot[tone]} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <b className={cn('text-base font-medium', tone === 'warn' && 'text-warn hc:font-bold hc:text-foreground')}>
            {label}
          </b>
          {value && <span className="ml-auto text-base font-medium">{value}</span>}
        </div>
        {children}
      </div>
    </li>
  )
}

function FixLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring hc:text-foreground hc:underline"
    >
      {children} <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  )
}

/** Qué entró al cálculo y qué falta: reemplaza a una pila de avisos. */
function Sources({ plan }: { plan: Saca }) {
  const missing = missingSellers(plan)
  const share = plan.sellers_total ? plan.sellers_registered / plan.sellers_total : 0
  const small = 'mt-0.5 block text-sm text-muted-foreground'
  return (
    <Section title={SOURCES_TITLE} className="@4xl/main:sticky @4xl/main:top-6 @4xl/main:row-span-2">
      <ul className="px-4 dsk:px-5">
        <SourceRow
          tone={missing ? 'warn' : 'ok'}
          label={`${SOURCE.projections} (${dayText(plan.projection_date)})`}
          value={coverageText(plan.sellers_registered, plan.sellers_total)}
        >
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={plan.sellers_total}
            aria-valuenow={plan.sellers_registered}
            aria-label={SOURCE.projections}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-chart-zero"
          >
            <div
              className={cn('h-full rounded-full', missing ? 'bg-warn' : 'bg-ok')}
              style={{ width: `${String(Math.round(share * 100))}%` }}
            />
          </div>
          {missing > 0 && <small className={small}>{missingNote(missing)}</small>}
          {missing > 0 && <FixLink to={paths.teamDay(plan.projection_date)}>{FIX_PROJECTIONS}</FixLink>}
        </SourceRow>
        <SourceRow
          tone={plan.stock_date ? 'ok' : 'warn'}
          label={SOURCE.stock}
          value={plan.stock_date ? unitsCount(plan.stock) : undefined}
        >
          <small className={small}>{plan.stock_date ? `Registro del ${dayText(plan.stock_date)}.` : NO_STOCK}</small>
          {!plan.stock_date && <FixLink to={paths.stock}>{FIX_STOCK}</FixLink>}
          {plan.stock_b > 0 && <small className={small}>{stockBNote(plan.stock_b)}</small>}
          {plan.stock_old > 0 && (
            <small className={small}>{stockOldNote(plan.stock_old, plan.stock_lot_days ?? 3)}</small>
          )}
        </SourceRow>
        <SourceRow
          tone={plan.orders_available ? 'ok' : 'off'}
          label={`${SOURCE.orders} (${dayText(plan.orders_date)})`}
          value={plan.orders_available ? unitsCount(plan.ordered) : undefined}
        >
          <small className={small}>{plan.orders_available ? ORDERS_OK : NO_ORDERS}</small>
        </SourceRow>
        <SourceRow tone={plan.forecast ? 'ok' : 'off'} label={SOURCE.arrival}>
          <small className={small}>
            {plan.forecast
              ? arrivalNote(plan.forecast.days, dShort(plan.forecast.date_from), dShort(plan.forecast.date_to))
              : NO_ARRIVAL}
          </small>
          {!plan.forecast && <FixLink to={paths.production}>{FIX_ARRIVAL}</FixLink>}
          {plan.forecast && <small className={small}>Modelo en uso: {modelLabel(plan.forecast.method)}.</small>}
        </SourceRow>
      </ul>
      <p className="border-t border-rule px-4 py-3 text-xs text-muted-foreground dsk:px-5">
        {FORMULA}
        <span className="mt-1.5 block">{FARM_ORDER_HINT}</span>
        {plan.forecast && <span className="mt-1.5 block">{ARRIVAL_HINT}</span>}
      </p>
    </Section>
  )
}

/** Angosto: producto y el resultado. Ancho: todas las columnas, en el orden de la fórmula. */
const colsCls = (arrival: boolean) =>
  cn(
    'grid items-center gap-x-3 grid-cols-[minmax(0,1fr)_5.5rem]',
    arrival
      ? 'sm:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.7fr))_minmax(0,0.9fr)_repeat(3,minmax(0,0.7fr))]'
      : 'sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,0.7fr))_minmax(0,1fr)_minmax(0,0.7fr)]',
  )
const numCls = 'num hidden text-right text-base sm:block'
/** Aves que se espera que lleguen en calidad B: las que llegan menos las de calidad A. */
const qualityB = (l: SacaLine) => Math.max(0, (l.expected ?? 0) - (l.expected_a ?? 0))

function ByProduct({ plan, products }: { plan: Saca; products: Product[] }) {
  const lines = new Map(plan.lines.map((l) => [l.product_id, l]))
  const max = Math.max(1, ...plan.lines.map((l) => l.request))
  const arrival = !!plan.forecast
  const cols = colsCls(arrival)
  const expectedTotal = plan.lines.reduce((s, l) => s + (l.expected ?? 0), 0)
  const expectedATotal = plan.lines.reduce((s, l) => s + (l.expected_a ?? 0), 0)
  const sum = (ps: Product[], pick: (l: SacaLine) => number) =>
    ps.reduce((s, p) => {
      const line = lines.get(p.id)
      return s + (line ? pick(line) : 0)
    }, 0)
  return (
    <div className="pb-1">
      <div
        className={cn(
          cols,
          'border-b border-rule-strong px-4 py-2.5 text-xs font-medium text-muted-foreground dsk:px-5 hc:border-b-heavy hc:font-bold hc:text-foreground',
        )}
      >
        <span>{COLUMNS.product}</span>
        <span className="hidden text-right sm:block">{COLUMNS.stock}</span>
        <span className="hidden text-right sm:block">{COLUMNS.ordered}</span>
        <span className="hidden text-right sm:block">{COLUMNS.projected}</span>
        <span className="text-right">{COLUMNS.request}</span>
        {arrival ? (
          <>
            <span className="hidden text-right sm:block">{COLUMNS.expected}</span>
            <span className="hidden text-right sm:block">{COLUMNS.expectedA}</span>
            <span className="hidden text-right sm:block">{COLUMNS.expectedB}</span>
          </>
        ) : (
          <span className="hidden text-right sm:block">{COLUMNS.kg}</span>
        )}
      </div>
      <div className="grid">
        {bySubcategory(products).map((g) => (
          <div key={g.name ?? '-'}>
            <div className="flex items-baseline gap-3 border-b border-rule bg-muted px-4 py-2 dsk:px-5">
              <b className="eyebrow min-w-0 flex-1 hc:text-foreground">{g.name ?? 'Otros'}</b>
              <span className="text-sm text-muted-foreground">
                <b className="num font-medium text-foreground">{nf0(sum(g.products, (l) => l.request))}</b> en total
              </span>
            </div>
            {g.products.map((p) => {
              const l = lines.get(p.id)
              if (!l) return null
              const idle = l.stock === 0 && l.ordered === 0 && l.projected === 0 && !l.expected
              return (
                <div
                  key={p.id}
                  className={cn(
                    cols,
                    'border-b border-rule px-4 py-2.5 last:border-0 dsk:px-5',
                    idle && 'text-muted-foreground',
                  )}
                >
                  <span className="min-w-0">
                    <b className="block truncate font-medium">{p.name}</b>
                    {/* En angosto, el desglose va bajo el nombre en vez de en columnas. */}
                    <small className="block text-xs text-muted-foreground sm:hidden">
                      {nf0(l.stock)} stock − {nf0(l.ordered)} ped. + {nf0(l.projected)} proy.
                    </small>
                  </span>
                  <span className={cn(numCls, !l.stock && 'text-faint')}>{nf0(l.stock)}</span>
                  <span className={cn(numCls, !l.ordered && 'text-faint')}>
                    {l.ordered ? `−${nf0(l.ordered)}` : '0'}
                  </span>
                  <span className={cn(numCls, !l.projected && 'text-faint')}>
                    {l.projected ? `+${nf0(l.projected)}` : '0'}
                  </span>
                  <span className="text-right">
                    <b
                      className={cn(
                        'num block text-md font-semibold hc:font-extrabold',
                        !l.request && 'font-normal text-faint',
                      )}
                    >
                      {nf0(l.request)}
                    </b>
                    <span aria-hidden className="mt-1 ml-auto block h-1 w-full max-w-28 bg-chart-zero">
                      <span
                        className="ml-auto block h-full bg-chart-1"
                        style={{ width: `${String(Math.round((l.request / max) * 100))}%` }}
                      />
                    </span>
                    {arrival ? (
                      <small className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                        llegarán {nf0(l.expected ?? 0)}
                        {qualityB(l) > 0 && <span className="block">{nf0(qualityB(l))} en B</span>}
                      </small>
                    ) : (
                      l.request > 0 && (
                        <small className="num mt-0.5 block text-xs text-muted-foreground sm:hidden">
                          {kgAmount(l.request_kg)}
                        </small>
                      )
                    )}
                  </span>
                  {arrival ? (
                    <>
                      <span className={cn(numCls, 'font-semibold', !l.expected && 'font-normal text-faint')}>
                        {nf0(l.expected ?? 0)}
                      </span>
                      <span className={cn(numCls, 'text-muted-foreground')}>{nf0(l.expected_a ?? 0)}</span>
                      <span className={cn(numCls, 'text-muted-foreground', !qualityB(l) && 'text-faint')}>
                        {nf0(qualityB(l))}
                      </span>
                    </>
                  ) : (
                    <span className={cn(numCls, 'text-muted-foreground')}>
                      {l.request_kg ? nf1(l.request_kg) : '—'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div
        className={cn(
          cols,
          'border-t border-rule-strong bg-muted px-4 py-3 text-md font-semibold dsk:px-5 hc:border-t-heavy hc:border-foreground',
        )}
      >
        <span>{COLUMNS.total}</span>
        <span className={cn(numCls, 'text-md')}>{nf0(plan.stock)}</span>
        <span className={cn(numCls, 'text-md')}>{plan.ordered ? `−${nf0(plan.ordered)}` : '0'}</span>
        <span className={cn(numCls, 'text-md')}>{plan.projected ? `+${nf0(plan.projected)}` : '0'}</span>
        <span className="num text-right">{nf0(plan.request)}</span>
        {arrival ? (
          <>
            <span className={cn(numCls, 'text-md')}>{nf0(expectedTotal)}</span>
            <span className={cn(numCls, 'text-md')}>{nf0(expectedATotal)}</span>
            <span className={cn(numCls, 'text-md')}>{nf0(expectedTotal - expectedATotal)}</span>
          </>
        ) : (
          <span className={cn(numCls, 'text-md')}>{nf1(plan.request_kg)}</span>
        )}
      </div>
    </div>
  )
}
