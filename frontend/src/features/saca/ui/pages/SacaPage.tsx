import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Check, Minus, TriangleAlert } from 'lucide-react'
import { useContainer } from '@/app/di'
import { addDays, dDowLong, dShort, today, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { bySubcategory } from '@/features/catalog/domain/catalog'
import type { Product } from '@/features/catalog/domain/schemas'
import { useCatalog } from '@/features/catalog/ui/hooks'
import {
  SACA_METHODS,
  missingSellers,
  sacaDays,
  sacaMethodSchema,
  storeMethod,
  storedMethod,
  type Saca,
  type SacaLine,
  type SacaMethod,
} from '@/features/saca/domain/saca'
import {
  ARRIVAL_HINT,
  BIRDS_LABEL,
  BY_PRODUCT_TITLE,
  COLUMNS,
  DAY_LABEL,
  FORMULA,
  HERO_LABEL,
  METHOD_LABEL,
  METHOD_OPTION,
  KG_LABEL,
  LIVE_LABEL,
  NO_ARRIVAL,
  NO_ORDERS,
  NO_STOCK,
  NOTHING_BODY,
  NOTHING_TITLE,
  ORDERS_OK,
  SACA_SUBTITLE,
  SACA_TITLE,
  SOURCE,
  SOURCES_TITLE,
  TODAY_LABEL,
  TOMORROW_LABEL,
  arrivalNote,
  coverageText,
  missingNote,
  modelLabel,
} from '@/features/saca/types/saca'
import { DayStrip } from '@/shared/ui/components/day-strip'
import { EmptyState, Note } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'

/** Supervisor: cuánto pedir a granja para un día, por producto, y con qué datos se calculó. */
export function SacaPage() {
  const { saca } = useContainer()
  const { catalog } = useCatalog()
  const ref = today()
  const [day, setDay] = useState<IsoDate>(addDays(ref, 1))
  const [method, setMethod] = useState<SacaMethod>(() => storedMethod(globalThis.localStorage))
  const query = useQuery({ queryKey: ['saca', day, method], queryFn: () => saca.plan(day, method) })
  const chooseMethod = (next: SacaMethod) => {
    storeMethod(globalThis.localStorage, next)
    setMethod(next)
  }
  const plan = query.data

  return (
    <div>
      <PageHeader title={SACA_TITLE} subtitle={SACA_SUBTITLE} />
      <PageBody>
        <DayStrip
          days={sacaDays(ref)}
          value={day}
          onChange={setDay}
          label={DAY_LABEL}
          caption={(d) => (d === ref ? TODAY_LABEL : d === addDays(ref, 1) ? TOMORROW_LABEL : undefined)}
        />
        <label className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[13px] font-bold tracking-[0.04em] text-muted-foreground uppercase">
            {METHOD_LABEL}
          </span>
          <select
            value={method}
            onChange={(e) => chooseMethod(sacaMethodSchema.parse(e.target.value))}
            className="h-11 max-w-full min-w-0 flex-1 rounded-[10px] border-[1.5px] border-border bg-white px-3 text-[14.5px] font-semibold outline-none focus:border-primary focus:ring-4 focus:ring-primary-ring sm:flex-none"
          >
            {SACA_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_OPTION[m]}
              </option>
            ))}
          </select>
        </label>
        {query.isError && (
          <Note tone="bad" icon={<AlertCircle />}>
            <div>{query.error.message}</div>
          </Note>
        )}
        {plan && (
          // En pantallas anchas: resumen y detalle a la izquierda, datos de origen fijos a la derecha.
          // En angostas se apilan en este orden: resumen, datos de origen, detalle.
          <div className="grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_340px]">
            <Hero plan={plan} />
            <Sources plan={plan} />
            <Section title={BY_PRODUCT_TITLE} className="@4xl/main:col-start-1">
              {plan.sellers_registered === 0 ? (
                <EmptyState title={NOTHING_TITLE}>{NOTHING_BODY}</EmptyState>
              ) : (
                <ByProduct plan={plan} products={catalog?.products ?? []} />
              )}
            </Section>
          </div>
        )}
      </PageBody>
    </div>
  )
}

/** El número que importa, grande; lo demás, al lado. */
function Hero({ plan }: { plan: Saca }) {
  return (
    <section className="rounded-[18px] bg-primary p-5 text-white shadow-card dsk:p-6">
      <p className="text-[13px] font-bold tracking-[0.05em] text-white/80 uppercase">
        {HERO_LABEL} · {dDowLong(plan.date)} {dShort(plan.date).split(' ')[1]}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-4">
        <p className="flex items-baseline gap-2">
          <b className="text-[52px] leading-none font-extrabold tracking-[-0.04em] tabular-nums dsk:text-[64px]">
            {nf0(plan.request)}
          </b>
          <span className="text-[17px] font-semibold text-white/85">{BIRDS_LABEL}</span>
        </p>
        <dl className="flex gap-6 pb-1.5">
          <div>
            <dd className="text-[20px] leading-tight font-extrabold tabular-nums">{nf1(plan.request_kg)}</dd>
            <dt className="text-[12.5px] text-white/80">{KG_LABEL}</dt>
          </div>
          <div>
            <dd className="text-[20px] leading-tight font-extrabold tabular-nums">{nf1(plan.live_kg)}</dd>
            <dt className="text-[12.5px] text-white/80">
              {LIVE_LABEL} · rend. {nf0(plan.yield_factor * 100)} %
            </dt>
          </div>
        </dl>
      </div>
    </section>
  )
}

type Tone = 'ok' | 'warn' | 'off'
const toneCls: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  off: 'bg-muted text-muted-foreground',
}

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
  const Icon = tone === 'ok' ? Check : tone === 'warn' ? TriangleAlert : Minus
  return (
    <li className="flex gap-3 border-b border-muted py-3 first:pt-1 last:border-0 last:pb-0">
      <span className={cn('mt-0.5 grid size-7 flex-none place-items-center rounded-full', toneCls[tone])}>
        <Icon className="size-4" strokeWidth={2.6} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <b className="text-[14.5px]">{label}</b>
          {value && <span className="ml-auto text-[14px] font-semibold tabular-nums">{value}</span>}
        </div>
        {children}
      </div>
    </li>
  )
}

/** Qué entró al cálculo y qué falta: reemplaza a una pila de avisos. */
function Sources({ plan }: { plan: Saca }) {
  const missing = missingSellers(plan)
  const share = plan.sellers_total ? plan.sellers_registered / plan.sellers_total : 0
  const small = 'mt-0.5 block text-[13px] text-muted-foreground'
  return (
    <Section title={SOURCES_TITLE} className="@4xl/main:sticky @4xl/main:top-6 @4xl/main:row-span-2">
      <ul className="px-4 pb-4 dsk:px-5">
        <SourceRow
          tone={missing ? 'warn' : 'ok'}
          label={SOURCE.projections}
          value={coverageText(plan.sellers_registered, plan.sellers_total)}
        >
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={plan.sellers_total}
            aria-valuenow={plan.sellers_registered}
            aria-label={SOURCE.projections}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn('h-full rounded-full', missing ? 'bg-warn' : 'bg-ok')}
              style={{ width: `${String(Math.round(share * 100))}%` }}
            />
          </div>
          {missing > 0 && <small className={small}>{missingNote(missing)}</small>}
        </SourceRow>
        <SourceRow
          tone={plan.stock_date ? 'ok' : 'warn'}
          label={SOURCE.stock}
          value={plan.stock_date ? `${nf0(plan.stock)} unid.` : undefined}
        >
          <small className={small}>{plan.stock_date ? `Registro del ${dShort(plan.stock_date)}.` : NO_STOCK}</small>
        </SourceRow>
        <SourceRow
          tone={plan.orders_available ? 'ok' : 'off'}
          label={SOURCE.orders}
          value={plan.orders_available ? `${nf0(plan.ordered)} unid.` : undefined}
        >
          <small className={small}>{plan.orders_available ? ORDERS_OK : NO_ORDERS}</small>
        </SourceRow>
        <SourceRow tone={plan.forecast ? 'ok' : 'off'} label={SOURCE.arrival}>
          <small className={small}>
            {plan.forecast
              ? arrivalNote(plan.forecast.days, dShort(plan.forecast.date_from), dShort(plan.forecast.date_to))
              : NO_ARRIVAL}
          </small>
          {plan.forecast && <small className={small}>Modelo en uso: {modelLabel(plan.forecast.method)}.</small>}
        </SourceRow>
      </ul>
      <p className="border-t border-muted px-4 py-3 text-[12.5px] text-muted-foreground dsk:px-5">
        {FORMULA[plan.method]}
        {plan.forecast && <span className="mt-1.5 block">{ARRIVAL_HINT}</span>}
      </p>
    </Section>
  )
}

/** Angosto: producto y lo que hay que pedir. Ancho: todas las columnas del cálculo. */
const colsCls = (orders: boolean, arrival: boolean) =>
  cn('grid items-center gap-x-3 grid-cols-[minmax(0,1fr)_5.5rem]', COLS[`${orders ? 3 : 2}-${arrival ? 2 : 1}`])
// Producto · proyección (· pedidos) · stock · pedir · (llegará · calidad A · calidad B |) kg
const COLS: Record<string, string> = {
  '2-1': 'sm:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,0.7fr))_minmax(0,1fr)_minmax(0,0.7fr)]',
  '3-1': 'sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,0.7fr))_minmax(0,1fr)_minmax(0,0.7fr)]',
  '2-2': 'sm:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,0.7fr))_minmax(0,0.9fr)_repeat(3,minmax(0,0.7fr))]',
  '3-2': 'sm:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.7fr))_minmax(0,0.9fr)_repeat(3,minmax(0,0.7fr))]',
}
const numCls = 'hidden text-right text-[14px] tabular-nums sm:block'
/** Aves que se espera que lleguen en calidad B: las que llegan menos las de calidad A. */
const qualityB = (l: SacaLine) => Math.max(0, (l.expected ?? 0) - (l.expected_a ?? 0))

function ByProduct({ plan, products }: { plan: Saca; products: Product[] }) {
  const lines = new Map(plan.lines.map((l) => [l.product_id, l]))
  const max = Math.max(1, ...plan.lines.map((l) => l.request))
  const arrival = !!plan.forecast
  const cols = colsCls(plan.orders_available, arrival)
  const expectedTotal = plan.lines.reduce((s, l) => s + (l.expected ?? 0), 0)
  const expectedATotal = plan.lines.reduce((s, l) => s + (l.expected_a ?? 0), 0)
  const sum = (ps: Product[], pick: (l: SacaLine) => number) =>
    ps.reduce((s, p) => {
      const line = lines.get(p.id)
      return s + (line ? pick(line) : 0)
    }, 0)
  return (
    <div className="px-3 pt-2 pb-4 dsk:px-4">
      <div className={cn(cols, 'px-3 pb-1.5 text-[12px] font-bold tracking-[0.04em] text-muted-foreground uppercase')}>
        <span>{COLUMNS.product}</span>
        <span className="hidden text-right sm:block">{COLUMNS.projected}</span>
        {plan.orders_available && <span className="hidden text-right sm:block">{COLUMNS.ordered}</span>}
        <span className="hidden text-right sm:block">{COLUMNS.stock}</span>
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
      <div className="grid gap-3">
        {bySubcategory(products).map((g) => (
          <div key={g.name ?? '-'}>
            <div className="flex items-baseline gap-3 rounded-[10px] bg-muted/70 px-3 py-2">
              <b className="min-w-0 flex-1 text-[13px] tracking-[0.02em] text-ink-2 uppercase">{g.name ?? 'Otros'}</b>
              <span className="text-[13px] text-muted-foreground tabular-nums">
                <b className="text-foreground">{nf0(sum(g.products, (l) => l.request))}</b> a pedir
              </span>
            </div>
            {g.products.map((p) => {
              const l = lines.get(p.id)
              if (!l) return null
              const idle = l.demand === 0 && l.stock === 0 && !l.expected
              return (
                <div
                  key={p.id}
                  className={cn(cols, 'border-b border-muted px-3 py-2.5 last:border-0', idle && 'opacity-45')}
                >
                  <span className="min-w-0">
                    <b className="block truncate text-[15px]">{p.name}</b>
                    {/* En angosto, el desglose va bajo el nombre en vez de en columnas. */}
                    <small className="block text-[12.5px] text-muted-foreground tabular-nums sm:hidden">
                      {nf0(l.demand)} proy.{l.stock > 0 ? ` − ${nf0(l.stock)} stock` : ''}
                    </small>
                  </span>
                  <span className={numCls}>{nf0(l.projected)}</span>
                  {plan.orders_available && <span className={numCls}>{nf0(l.ordered)}</span>}
                  <span className={cn(numCls, l.stock > l.demand && 'font-semibold text-warn')}>
                    {l.stock ? `−${nf0(l.stock)}` : '0'}
                  </span>
                  <span className="text-right">
                    <b className={cn('block text-[16px] tabular-nums', l.request ? 'text-primary' : 'text-faint')}>
                      {nf0(l.request)}
                    </b>
                    <span aria-hidden className="mt-1 ml-auto block h-1 w-full max-w-[7rem] rounded-full bg-muted">
                      <span
                        className="ml-auto block h-full rounded-full bg-primary"
                        style={{ width: `${String(Math.round((l.request / max) * 100))}%` }}
                      />
                    </span>
                    {arrival ? (
                      <small className="mt-0.5 block text-[12px] text-muted-foreground tabular-nums sm:hidden">
                        llegarán {nf0(l.expected ?? 0)}
                        {qualityB(l) > 0 && <span className="block">{nf0(qualityB(l))} en B</span>}
                      </small>
                    ) : (
                      l.request > 0 && (
                        <small className="mt-0.5 block text-[12px] text-muted-foreground tabular-nums sm:hidden">
                          {nf1(l.request_kg)} kg
                        </small>
                      )
                    )}
                  </span>
                  {arrival ? (
                    <>
                      <span className={cn(numCls, 'font-bold', !l.expected && 'font-normal text-faint')}>
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
      <div className={cn(cols, 'mt-3 rounded-[12px] bg-secondary px-3 py-3 text-[15px] font-extrabold')}>
        <span>{COLUMNS.total}</span>
        <span className={cn(numCls, '!text-[15px]')}>{nf0(plan.projected)}</span>
        {plan.orders_available && <span className={cn(numCls, '!text-[15px]')}>{nf0(plan.ordered)}</span>}
        <span className={cn(numCls, '!text-[15px]')}>{plan.stock ? `−${nf0(plan.stock)}` : '0'}</span>
        <span className="text-right tabular-nums">{nf0(plan.request)}</span>
        {arrival ? (
          <>
            <span className={cn(numCls, '!text-[15px]')}>{nf0(expectedTotal)}</span>
            <span className={cn(numCls, '!text-[15px]')}>{nf0(expectedATotal)}</span>
            <span className={cn(numCls, '!text-[15px]')}>{nf0(expectedTotal - expectedATotal)}</span>
          </>
        ) : (
          <span className={cn(numCls, '!text-[15px]')}>{nf1(plan.request_kg)}</span>
        )}
      </div>
    </div>
  )
}
