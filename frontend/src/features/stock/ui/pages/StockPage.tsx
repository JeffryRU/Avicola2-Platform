import { useState, type SyntheticEvent } from 'react'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { addDays, dDowLongDM, type IsoDate, recentDayStrip, relativeDay, today } from '@/shared/domain/dates'
import { nf0 } from '@/shared/domain/format'
import { can, hasTeamView } from '@/shared/domain/session'
import { useRequiredSession } from '@/features/auth'
import {
  ALL,
  byLocation,
  draftOf,
  draftTotals,
  isEditableDay,
  linesAt,
  locationsOf,
  shownLots,
  STOCK_BACK_DAYS,
  type StockDay,
  type StockDraft,
  type StockOptions,
  type StockView,
  toEntries,
  visibleGroups,
} from '@/features/stock/domain/stock'
import {
  ALL_LOCATIONS,
  DAY_LABEL,
  HISTORY_DAYS,
  lotCountsNote,
  NOT_REGISTERED_BODY,
  NOT_REGISTERED_TITLE,
  PICK_LOCATION,
  REGISTERED_LABEL,
  SAVE_LABEL,
  SAVED_MESSAGE,
  STOCK_SUBTITLE_MANAGE,
  STOCK_SUBTITLE_VIEW,
  STOCK_TITLE,
  UNITS_ONLY_HINT,
  unitsLabel,
  UPDATE_LABEL,
} from '@/features/stock/types/stock'
import { useRegisterStock, useStock, useStockOptions, useStockView } from '@/features/stock/ui/hooks'
import { paths } from '@/app/routes'
import { kgAmount } from '@/shared/types/labels'
import { DayStrip } from '@/shared/ui/components/day-strip'
import { EmptyState } from '@/shared/ui/components/feedback'
import { SyncStatus } from '@/shared/ui/components/sync-status'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'
import { Filters } from '@/features/stock/ui/components/stock-filters'
import { Grid } from '@/features/stock/ui/components/stock-grid'
import { Summary } from '@/features/stock/ui/components/stock-summary'
import { History } from '@/features/stock/ui/components/stock-history'
import { readOnlyDayLabel } from '@/shared/types/daily-record'

const FORM_ID = 'stock-form'
/** Dos columnas desde ~900 px de contenido: el detalle a la izquierda y el resumen fijo a la derecha. */
const splitCls = 'grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_320px]'
const asideCls = 'grid gap-4 @4xl/main:sticky @4xl/main:top-6'

/** Stock de despacho: el jefe de despacho lo registra por artículo y lote; el supervisor lo consulta. */
export function StockPage() {
  const session = useRequiredSession()
  const canManage = can(session, 'manage_stock')
  const optionsQuery = useStockOptions()
  const options = optionsQuery.options
  const ref = today()
  const [day, setDay] = useState<IsoDate>(ref)
  const stock = useStock(addDays(ref, -(HISTORY_DAYS - 1)), ref)
  const days = stock.data ?? []
  const record = days.find((d) => d.date === day)
  const [current, setView] = useStockView(options.lot_days)
  // La tira muestra los días que se pueden registrar; un día más antiguo se abre desde la lista.
  const strip = recentDayStrip(day, ref, STOCK_BACK_DAYS)
  const history = <History days={days} selected={day} onSelect={setDay} pending={stock.isPending} />

  return (
    <div>
      <PageHeader
        title={STOCK_TITLE}
        subtitle={canManage ? STOCK_SUBTITLE_MANAGE : STOCK_SUBTITLE_VIEW}
        back={hasTeamView(session) ? paths.home : null}
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
        <SyncStatus queries={[stock, optionsQuery]} />
        {
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
            readOnlyNote={canManage && !isEditableDay(day, ref) ? readOnlyDayLabel(STOCK_BACK_DAYS) : undefined}
            history={history}
          />
        }
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
        <Section title={dDowLongDM(day)} aside={<Scope location={location} />}>
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
            <small className="block text-[12.5px] text-muted-foreground">{kgAmount(totals.kg)}</small>
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
