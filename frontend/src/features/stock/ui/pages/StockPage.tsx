import { useState, type SyntheticEvent } from 'react'
import { Check, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  addDays,
  dDM,
  dDow,
  dDowLong,
  diffDays,
  dShort,
  formatTime,
  hhmm,
  today,
  type IsoDate,
} from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { can, hasTeamView } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import type { Product } from '@/features/catalog/domain/schemas'
import { dateOf } from '@/features/editing/domain/editing'
import {
  ALL,
  LOT_OFFSETS,
  QUALITIES,
  UNITS,
  byLocation,
  cellKey,
  draftOf,
  draftTotals,
  editableDays,
  isEditableDay,
  kgOf,
  linesAt,
  locationsOf,
  shownLots,
  storeView,
  storedView,
  toEntries,
  toggleLot,
  typesOf,
  unitsAt,
  visibleGroups,
  type StockDay,
  type StockDraft,
  type StockOptions,
  type StockTotals,
  type StockView,
} from '@/features/stock/domain/stock'
import {
  ALL_LOCATIONS,
  ALL_TYPES,
  BY_LOCATION_TITLE,
  COLUMNS,
  DAY_LABEL,
  HISTORY_DAYS,
  LOCATION_LABEL,
  LOTS_HINT,
  LOTS_LABEL,
  NOT_REGISTERED_BODY,
  NOT_REGISTERED_TITLE,
  OLD_LOT,
  PICK_LOCATION,
  QUALITY_B_TAG,
  QUALITY_LABEL,
  QUALITY_OPTION,
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
  TYPE_LABEL,
  UNIT_LABEL,
  UNIT_OPTION,
  UNITS_ONLY_HINT,
  UPDATE_LABEL,
  YESTERDAY_LABEL,
  lotAgeLabel,
  lotCountsNote,
  unitsLabel,
} from '@/features/stock/types/stock'
import { useRegisterStock, useStock, useStockOptions } from '@/features/stock/ui/hooks'
import { DayStrip } from '@/shared/ui/components/day-strip'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'

const FORM_ID = 'stock-form'
const kgText = (n: number) => `${nf1(n)} kg`
const cellCls =
  'h-10 w-full min-w-[4.25rem] rounded-[10px] border-[1.5px] border-border bg-white px-1.5 text-center text-[15px] tabular-nums outline-none transition-colors placeholder:text-faint focus:border-primary focus:ring-4 focus:ring-primary-ring'
const selectCls =
  'h-11 w-full min-w-0 rounded-[10px] border-[1.5px] border-border bg-white px-3 text-[14.5px] font-semibold outline-none focus:border-primary focus:ring-4 focus:ring-primary-ring'
const labelCls = 'mb-1 block text-[12px] font-bold tracking-[0.04em] text-muted-foreground uppercase'
/** Dos columnas desde ~900 px de contenido: el detalle a la izquierda y el resumen fijo a la derecha. */
const splitCls = 'grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_320px]'
const asideCls = 'grid gap-4 @4xl/main:sticky @4xl/main:top-6'
const dayTitle = (day: IsoDate) => `${dDowLong(day)} ${dShort(day).split(' ')[1]}`

/** Stock de despacho: el jefe de despacho lo registra por artículo y lote; el supervisor lo consulta. */
export function StockPage() {
  const session = useRequiredSession()
  const canManage = can(session, 'manage_stock')
  const options = useStockOptions().data
  const ref = today()
  const [day, setDay] = useState<IsoDate>(ref)
  const stock = useStock(addDays(ref, -(HISTORY_DAYS - 1)), ref)
  const days = stock.data ?? []
  const record = days.find((d) => d.date === day)
  // Cómo se mira el stock: se recuerda en este equipo hasta que se cambie.
  const [view, setViewState] = useState<StockView | null>(null)
  const current = view ?? storedView(globalThis.localStorage, options?.lot_days)
  const setView = (patch: Partial<StockView>) => {
    const next = { ...current, ...patch }
    storeView(globalThis.localStorage, next)
    setViewState(next)
  }
  // La tira muestra los días que se pueden registrar; un día más antiguo se abre desde la lista.
  const strip = editableDays(ref).includes(day) ? editableDays(ref) : [...editableDays(ref), day]
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
          marked={new Set(days.map((d) => d.date))}
          markedLabel={REGISTERED_LABEL}
          caption={(d) => (d === ref ? TODAY_LABEL : d === addDays(ref, -1) ? YESTERDAY_LABEL : undefined)}
        />
        {stock.isPending || !options ? null : (
          <Board
            // Al cambiar de día, de ubicación o al guardar, el borrador parte de lo registrado.
            key={`${day}:${current.location}:${record?.recorded_at ?? ''}`}
            day={day}
            options={options}
            locations={locationsOf(options.locations, days)}
            record={record}
            view={current}
            setView={setView}
            editable={canManage && isEditableDay(day, ref)}
            readOnlyNote={canManage && !isEditableDay(day, ref) ? READ_ONLY_DAY_LABEL : undefined}
            history={history}
          />
        )}
      </PageBody>
    </div>
  )
}

function Board({
  day,
  options,
  locations,
  record,
  view,
  setView,
  editable,
  readOnlyNote,
  history,
}: {
  day: IsoDate
  options: StockOptions
  locations: string[]
  record?: StockDay
  view: StockView
  setView: (patch: Partial<StockView>) => void
  editable: boolean
  readOnlyNote?: string
  history: React.ReactNode
}) {
  const register = useRegisterStock()
  // Una ubicación guardada que ya no existe se trata como «todas».
  const location = view.location === ALL || locations.includes(view.location) ? view.location : ALL
  const lines = linesAt(record, location)
  const [initial] = useState<StockDraft>(() => draftOf(lines))
  const [draft, setDraft] = useState<StockDraft>(initial)
  const writing = editable && location !== ALL
  const dirty = writing && JSON.stringify(draft) !== JSON.stringify(initial)
  const lots = shownLots(day, view.lots, lines)
  const groups = visibleGroups(options.items, view)
  const totals = draftTotals(options.items, draft)

  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    register.mutate(
      { day, location, lines: toEntries(options.items, draft, day) },
      { onSuccess: () => toast.success(SAVED_MESSAGE), onError: (err) => toast.error(err.message) },
    )
  }
  const save = (className: string) => (
    <Button type="submit" form={FORM_ID} disabled={register.isPending} className={cn('h-12 font-bold', className)}>
      {register.isPending ? <Loader2 className="animate-spin" /> : <Save />} {lines.length ? UPDATE_LABEL : SAVE_LABEL}
    </Button>
  )

  return (
    <>
      <Filters view={{ ...view, location }} setView={setView} options={options} locations={locations} day={day} />
      <div className={splitCls}>
        <Section title={dayTitle(day)} aside={<Scope location={location} />}>
          {!writing && lines.length === 0 ? (
            <EmptyState title={NOT_REGISTERED_TITLE}>{editable ? PICK_LOCATION : NOT_REGISTERED_BODY}</EmptyState>
          ) : (
            <form id={FORM_ID} onSubmit={submit} noValidate>
              <Grid
                groups={groups}
                lots={lots}
                day={day}
                lotDays={options.lot_days}
                draft={draft}
                unit={view.unit}
                onChange={writing ? (key, raw) => setDraft((d) => ({ ...d, [key]: raw })) : undefined}
              />
              <p className="px-4 pb-4 text-[13px] text-muted-foreground dsk:px-5">
                {writing ? UNITS_ONLY_HINT : editable ? PICK_LOCATION : null}
                <span className="block">{lotCountsNote(options.lot_days)}</span>
              </p>
            </form>
          )}
        </Section>
        <aside className={asideCls}>
          <Summary
            totals={totals}
            record={lines.length ? record : undefined}
            dirty={dirty}
            note={readOnlyNote}
            byPlace={location === ALL ? byLocation(record) : undefined}
            action={writing && <div className="mt-4 hidden @4xl/main:grid">{save('w-full')}</div>}
          />
          {history}
        </aside>
      </div>
      {writing && (
        <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 mt-4 flex items-center gap-3 rounded-[16px] border bg-white/95 p-3 shadow-card backdrop-blur-md dsk:bottom-4 @4xl/main:hidden">
          <span className="min-w-0 flex-1 pl-1 tabular-nums">
            <b className="block text-[17px] leading-tight">
              {nf0(totals.units)}{' '}
              <span className="text-[13px] font-semibold text-muted-foreground">{unitsLabel(totals.units)}</span>
            </b>
            <small className="block text-[12.5px] text-muted-foreground">{kgText(totals.kg)}</small>
          </span>
          {save('flex-none px-5')}
        </div>
      )}
    </>
  )
}

function Scope({ location }: { location: string }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-[12.5px] font-bold text-ink-2">
      {location === ALL ? ALL_LOCATIONS : location}
    </span>
  )
}

/** Qué se ve: ubicación, tipo, calidad, unidad y los lotes que van como columnas. */
function Filters({
  view,
  setView,
  options,
  locations,
  day,
}: {
  view: StockView
  setView: (patch: Partial<StockView>) => void
  options: StockOptions
  locations: string[]
  day: IsoDate
}) {
  return (
    <Section className="mb-4">
      <div className="grid gap-3 px-4 pt-4 sm:grid-cols-2 dsk:px-5 @4xl/main:grid-cols-4">
        <Pick label={LOCATION_LABEL} value={view.location} onChange={(location) => setView({ location })}>
          <option value={ALL}>{ALL_LOCATIONS}</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Pick>
        <Pick label={TYPE_LABEL} value={view.type} onChange={(type) => setView({ type })}>
          <option value={ALL}>{ALL_TYPES}</option>
          {typesOf(options.items).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Pick>
        <Pick
          label={QUALITY_LABEL}
          value={view.quality}
          onChange={(q) => setView({ quality: QUALITIES.find((x) => x === q) ?? ALL })}
        >
          {QUALITIES.map((q) => (
            <option key={q} value={q}>
              {QUALITY_OPTION[q]}
            </option>
          ))}
        </Pick>
        <Pick
          label={UNIT_LABEL}
          value={view.unit}
          onChange={(u) => setView({ unit: UNITS.find((x) => x === u) ?? 'units' })}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_OPTION[u]}
            </option>
          ))}
        </Pick>
      </div>
      <div className="px-4 pt-3 pb-4 dsk:px-5">
        <span className={labelCls}>{LOTS_LABEL}</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={LOTS_LABEL}>
          {LOT_OFFSETS.map((offset) => {
            const lot = addDays(day, -offset)
            const on = view.lots.includes(offset)
            return (
              <button
                key={offset}
                type="button"
                aria-pressed={on}
                title={lotAgeLabel(offset)}
                onClick={() => setView({ lots: toggleLot(view.lots, offset) })}
                className={cn(
                  'h-9 rounded-full border-[1.5px] px-3 text-[13px] font-bold tabular-nums transition-colors',
                  on ? 'border-primary bg-primary text-white' : 'border-border bg-white text-ink-2',
                )}
              >
                {dDow(lot)} {dDM(lot)}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[12.5px] text-muted-foreground">{LOTS_HINT}</p>
      </div>
    </Section>
  )
}

function Pick({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="block min-w-0">
      <span className={labelCls}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        {children}
      </select>
    </label>
  )
}

/** Artículos en filas y lotes en columnas. Con `onChange` las celdas se escriben; sin él, se leen. */
function Grid({
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
                            onChange={(e) => onChange(key, e.target.value.replace(/\D/g, '').slice(0, 7))}
                            className={cellCls}
                          />
                          {unit !== 'units' && units > 0 && (
                            <small className="block pt-0.5 text-center text-[11.5px] text-muted-foreground tabular-nums">
                              {kgText(kgOf(p, units))}
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
function Amount({
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
          {kgText(kg)}
        </small>
      )}
    </span>
  )
}

function Summary({
  totals,
  record,
  dirty,
  note,
  byPlace,
  action,
}: {
  totals: StockTotals
  record?: StockDay
  dirty: boolean
  note?: string
  byPlace?: { location: string; units: number }[]
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
        <div className="mt-3">
          <b className="block text-[34px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
            {nf0(totals.units)}
          </b>
          <small className="mt-1 block text-[13px] text-muted-foreground">
            {unitsLabel(totals.units)} · {kgText(totals.kg)}
          </small>
        </div>
        <dl className="mt-3.5 grid grid-cols-2 gap-2 border-t border-muted pt-3 text-[13px]">
          <div>
            <dd className="text-[16px] font-extrabold tabular-nums">{nf0(totals.unitsA)}</dd>
            <dt className="text-muted-foreground">calidad A</dt>
          </div>
          <div>
            <dd className="text-[16px] font-extrabold tabular-nums">{nf0(totals.unitsB)}</dd>
            <dt className="text-muted-foreground">calidad B</dt>
          </div>
        </dl>
        {byPlace && byPlace.length > 0 && (
          <div className="mt-3.5 border-t border-muted pt-3">
            <h3 className={labelCls}>{BY_LOCATION_TITLE}</h3>
            <ul className="grid gap-1 text-[13.5px]">
              {byPlace.map((p) => (
                <li key={p.location} className="flex gap-2">
                  <span className="min-w-0 flex-1 truncate">{p.location}</span>
                  <b className="tabular-nums">{nf0(p.units)}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
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
