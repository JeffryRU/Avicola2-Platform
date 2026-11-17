import { useState, type SyntheticEvent } from 'react'
import { EditToggle } from '@/shared/ui/components/edit-toggle'
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
  REGISTER_STEPS,
  REGISTER_STEPS_TITLE,
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
import { Filters } from '@/features/stock/ui/components/stock-filters'
import { Grid } from '@/features/stock/ui/components/stock-grid'
import { Summary } from '@/features/stock/ui/components/stock-summary'
import { History } from '@/features/stock/ui/components/stock-history'
import { readOnlyDayLabel } from '@/shared/types/daily-record'

const FORM_ID = 'stock-form'
/** Dos columnas desde ~900 px de contenido: el detalle a la izquierda y el resumen fijo a la derecha. */
const splitCls = 'grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_20rem]'
const asideCls = 'grid gap-4 @4xl/main:sticky @4xl/main:top-6'

/** Stock de despacho: el jefe de despacho lo registra por artículo y lote; el supervisor lo consulta. */
export function StockPage() {
  const session = useRequiredSession()
  // La supervisión solo ve: registra o corrige tras tocar «Editar». El jefe de despacho, siempre.
  const [editing, setEditing] = useState(false)
  const supervision = hasTeamView(session)
  const canManage = can(session, 'manage_stock') && (!supervision || editing)
  const toggle =
    supervision && can(session, 'manage_stock') ? <EditToggle editing={editing} onChange={setEditing} /> : undefined
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
        actions={toggle}
        mobileActions={toggle}
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
            key={`${day}:${current.location}:${String(canManage)}:${record?.recorded_at ?? ''}`}
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
  // Quien registra parte de la primera ubicación: sin ubicación concreta no hay formulario.
  const saved = view.location === ALL || locations.includes(view.location) ? view.location : ALL
  const location = saved === ALL && editable ? (locations[0] ?? ALL) : saved
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
    <Button type="submit" form={FORM_ID} disabled={register.isPending} className={className}>
      {register.isPending ? <Loader2 className="animate-spin" /> : <Save />} {lines.length ? UPDATE_LABEL : SAVE_LABEL}
    </Button>
  )

  return (
    <>
      {writing && (
        <Section title={REGISTER_STEPS_TITLE} className="mb-4">
          <ol className="grid list-decimal gap-1 px-4 py-3 pl-9 text-sm text-ink-2 dsk:px-5 dsk:pl-10">
            {REGISTER_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Section>
      )}
      <Filters
        view={{ ...view, location }}
        setView={setView}
        options={options}
        locations={locations}
        day={day}
        allowAll={!editable}
      />
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
              <p className="px-4 pb-4 text-sm text-muted-foreground dsk:px-5">
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
            action={
              writing && (
                <div className="hidden border-t border-rule px-4 py-3 dsk:px-5 @4xl/main:grid">{save('w-full')}</div>
              )
            }
          />
          {history}
        </aside>
      </div>
      {writing && (
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-4 flex items-center gap-3 border-t border-border bg-surface px-4 py-3 dsk:bottom-0 dsk:mx-0 @4xl/main:hidden hc:border-t-heavy hc:border-foreground">
          <span className="min-w-0 flex-1">
            <b className="num block text-lg leading-tight font-medium hc:font-bold">
              {nf0(totals.units)}{' '}
              <span className="font-sans text-sm font-normal text-muted-foreground">{unitsLabel(totals.units)}</span>
            </b>
            <small className="num block text-xs text-muted-foreground">{kgAmount(totals.kg)}</small>
          </span>
          {save('flex-none px-5')}
        </div>
      )}
    </>
  )
}

function Scope({ location }: { location: string }) {
  return <span className="text-sm text-muted-foreground">{location === ALL ? ALL_LOCATIONS : location}</span>
}
