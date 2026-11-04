import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, Calendar, ChevronLeft, Info, Loader2, Lock, Wand2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useContainer } from '@/app/di'
import { paths } from '@/app/routes'
import { dFull, dShort, daysText, today, type IsoDate } from '@/shared/domain/dates'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { isSupervisor } from '@/features/auth/domain/session'
import { useSellers } from '@/features/dashboards/ui/hooks'
import type { MyDay } from '@/features/projections/domain/aggregation'
import type { Catalog } from '@/features/catalog/domain/catalog'
import { draftDates, emptyDays, newDraft, submittableDraft, type Draft } from '@/features/projections/domain/draft'
import { isoDateSchema } from '@/shared/domain/schemas'
import { DaysSlider } from '@/features/projections/ui/components/days-slider'
import { ProjectionMatrix } from '@/features/projections/ui/components/projection-matrix'
import { ReviewDialog } from '@/features/projections/ui/components/review-dialog'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { useMyDays } from '@/features/projections/ui/hooks'
import { LoadingOverlay, Note } from '@/shared/ui/components/feedback'
import { FooterActions, PageBody, PageHeader, Section, tableCls } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/components/shadcn/select'
import { useIsMobile } from '@/shared/ui/hooks/use-is-mobile'
import { cn } from '@/shared/ui/lib/utils'
import { kgPerUnitLabel } from '@/features/catalog/types/catalog'
import { daysCount } from '@/shared/types/labels'
import { closedDays, openDates, windowDates } from '@/features/editing/domain/editing'
import { closedDaysNote } from '@/features/editing/types/editing'
import { EditingDays } from '@/features/editing/ui/components/editing-days'
import { useEditingWindow } from '@/features/editing/ui/hooks'

/** Completa las unidades de cada fecha con lo ya confirmado (si es de la misma categoría). */
function withExisting(draft: Draft, days: Map<IsoDate, MyDay>): Draft {
  const units = { ...draft.units }
  for (const d of draftDates(draft)) {
    if (!units[d]) {
      const mine = days.get(d)
      units[d] = mine?.category === draft.category ? { ...mine.units } : {}
    }
  }
  return { ...draft, units }
}

function normalize(draft: Draft, catalog: Catalog, days: Map<IsoDate, MyDay>): Draft {
  let d = draft
  if (!catalog.categories.includes(d.category)) {
    d = { ...d, category: days.get(d.start)?.category ?? catalog.categories[0], subcategory: null, units: {} }
  }
  if (d.subcategory && !catalog.subcategories(d.category).includes(d.subcategory)) d = { ...d, subcategory: null }
  return d.step === 1 ? withExisting(d, days) : d
}

export function NewProjectionPage() {
  const { drafts, planning, projections } = useContainer()
  const { seller } = useRequiredSession()
  const { catalog } = useCatalog()
  const [params] = useSearchParams()
  // El supervisor registra o edita por un vendedor (?vendedor= desde el detalle del día).
  const supervisor = isSupervisor(seller)
  const team = (useSellers().data ?? []).filter((s) => !isSupervisor(s))
  const [target, setTarget] = useState(() => params.get('vendedor') ?? '')
  const owner = supervisor ? target : seller.username
  const ownerName = team.find((s) => s.username === owner)?.name ?? owner
  const { days } = useMyDays(owner || undefined)
  const editing = useEditingWindow().data
  // Días que se pueden registrar (hoy, mañana y pasado mañana); sin datos aún, sin tope.
  const allowed = editing ? windowDates(editing) : null
  const firstOpen = editing ? openDates(editing)[0] : undefined
  const mobile = useIsMobile()
  const navigate = useNavigate()
  const client = useQueryClient()
  // ?dia=AAAA-MM-DD abre la edición de un solo día (desde Inicio o el detalle).
  const [stored, setStored] = useState<Draft>(() => {
    const day = params.get('dia')
    if (day && isoDateSchema.safeParse(day).success && day >= today()) return { ...newDraft(day), days: 1, step: 1 }
    return drafts.load() ?? newDraft()
  })
  const [reviewing, setReviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [suggesting, setSuggesting] = useState(false)

  // Borrador efectivo: categoría válida y días ya confirmados precargados (derivado, sin efectos).
  const draft = useMemo(() => {
    let d = catalog ? normalize(stored, catalog, days) : stored
    if (allowed?.length) {
      // Se empieza en el primer día abierto: hoy (y quizá mañana) ya cerró por la hora de corte,
      // y un borrador guardado puede ser de otro día.
      const closedStart = closedDays(editing, [d.start]).length > 0
      if (firstOpen && (!allowed.includes(d.start) || closedStart)) d = { ...d, start: firstOpen, units: {} }
      const room = allowed.length - allowed.indexOf(d.start)
      if (d.days > room) d = { ...d, days: room }
    }
    return d
  }, [stored, catalog, days, allowed, editing, firstOpen])
  const setDraft = (next: Draft) => {
    setStored(next)
    drafts.save(next)
  }

  const dates = useMemo(() => draftDates(draft), [draft])
  if (!catalog) return <PageHeader title="Nueva proyección" />
  const loaded = catalog

  const products = catalog.selected(draft)
  const choiceLabel = catalog.label(draft)
  const choices = catalog.choices
  const choiceIndex = choices.findIndex((c) => c.category === draft.category && c.subcategory === draft.subcategory)
  const invalid = draft.tried ? emptyDays(draft) : []
  const alreadyConfirmed = dates.filter((d) => days.has(d))
  const closed = closedDays(editing, dates)
  const lastAllowed = allowed?.at(-1)
  const room = allowed ? allowed.length - Math.max(0, allowed.indexOf(draft.start)) : undefined

  if (draft.step === 0 || (supervisor && !owner)) {
    return (
      <div>
        <PageHeader title="Nueva proyección" mobileActions={<StepPill n={1} />} actions={<StepPill n={1} />} />
        <PageBody>
          <div className="grid gap-4 @3xl/main:grid-cols-2">
            <Section>
              <div className="px-4 pt-[22px] pb-4 dsk:px-5 dsk:pb-5">
                {supervisor && (
                  <div className="mb-[22px]">
                    <label id="np-seller-label" className="mb-2.5 block text-base font-bold">
                      Vendedor
                    </label>
                    <Select
                      value={target}
                      onValueChange={(v) => {
                        setTarget(v)
                        setDraft({ ...draft, units: {} })
                      }}
                    >
                      <SelectTrigger
                        aria-labelledby="np-seller-label"
                        className="!h-[54px] w-full rounded-[14px] border-[1.5px] bg-white text-[17px] font-semibold"
                      >
                        <SelectValue placeholder="Elige el vendedor" />
                      </SelectTrigger>
                      <SelectContent>
                        {team.map((s) => (
                          <SelectItem key={s.username} value={s.username}>
                            {s.name}
                            {s.zone ? ` · ${s.zone}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="mb-[22px]">
                  <label htmlFor="np-start" className="mb-2.5 block text-base font-bold">
                    Fecha de inicio
                  </label>
                  <div className="relative">
                    <Calendar className="absolute top-4 left-[15px] size-[22px] text-ink-2" />
                    <input
                      id="np-start"
                      type="date"
                      min={firstOpen ?? today()}
                      max={lastAllowed}
                      value={draft.start}
                      onChange={(e) => {
                        if (!e.target.value || e.target.value < today())
                          return void toast('Elige hoy o una fecha futura')
                        if (lastAllowed && e.target.value > lastAllowed)
                          return void toast(`Solo puedes registrar hasta el ${dShort(lastAllowed)}`)
                        if (closedDays(editing, [e.target.value]).length)
                          return void toast(closedDaysNote([e.target.value]))
                        setDraft({ ...draft, start: e.target.value, units: {} })
                      }}
                      className="h-[54px] w-full rounded-[14px] border-[1.5px] bg-white pr-3 pl-12 text-[17px] font-semibold outline-none focus:border-primary focus:ring-4 focus:ring-primary-ring"
                    />
                  </div>
                </div>
                <div className="mb-[22px]">
                  <span className="mb-2.5 block text-base font-bold">Días de proyección</span>
                  <DaysSlider
                    value={draft.days}
                    max={room}
                    onChange={(n) => setDraft({ ...draft, days: n, units: {} })}
                  />
                  <Note icon={<Calendar />} className="mt-[18px]">
                    <div>
                      Se proyectarán <b>{daysCount(draft.days)}:</b>
                      <br />
                      {daysText(dates)}
                    </div>
                  </Note>
                  {closed.length > 0 && (
                    <Note tone="bad" icon={<Lock />} className="mt-3">
                      <div>{closedDaysNote(closed)}</div>
                    </Note>
                  )}
                  {alreadyConfirmed.length > 0 && (
                    <Note tone="warn" icon={<Info />} className="mt-3">
                      <div>
                        Ya confirmaste {alreadyConfirmed.map(dShort).join(', ')}. Si continúas, verás esos valores y
                        podrás corregirlos.
                      </div>
                    </Note>
                  )}
                </div>
                <EditingDays className="mb-[22px]" />
                <div className="mb-1.5">
                  <label id="np-cat-label" className="mb-2.5 block text-base font-bold">
                    Categoría
                  </label>
                  <Select
                    value={String(choiceIndex)}
                    onValueChange={(i) => {
                      const c = choices[Number(i)]
                      // Cambiar solo el tamaño conserva lo escrito; cambiar de categoría lo borra.
                      const units = c.category === draft.category ? draft.units : {}
                      setDraft({ ...draft, category: c.category, subcategory: c.subcategory, units })
                    }}
                  >
                    <SelectTrigger
                      aria-labelledby="np-cat-label"
                      className="!h-[54px] w-full rounded-[14px] border-[1.5px] bg-white text-[17px] font-semibold"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {choices.map((c, i) => (
                        <SelectItem key={`${c.category}|${c.subcategory ?? ''}`} value={String(i)}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>
            <Section
              title={`Productos: ${choiceLabel}`}
              aside={<span className="text-muted-foreground">{products.length}</span>}
              className="hidden @3xl/main:block"
            >
              <div className="overflow-x-auto px-5 pb-5">
                <table className={tableCls.table}>
                  <thead>
                    <tr>
                      <th className={cn(tableCls.th, '!text-left')}>Producto</th>
                      <th className={cn(tableCls.th, '!text-left')}>Presentación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td className={tableCls.td}>{p.name}</td>
                        <td className={cn(tableCls.td, '!text-left text-muted-foreground')}>
                          {kgPerUnitLabel(p.kg_per_unit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
          <FooterActions>
            <Button
              variant="ghost"
              className="h-10 flex-none font-bold text-ink-2"
              onClick={() => navigate(paths.home)}
            >
              Cancelar
            </Button>
            <Button
              className="h-[54px] flex-1 rounded-[14px] text-[16.5px] font-bold dsk:min-w-[220px] dsk:flex-none"
              disabled={closed.length > 0 || !owner}
              onClick={() => setDraft(withExisting({ ...draft, step: 1, tried: false }, days))}
            >
              Continuar <ArrowRight className="size-5" />
            </Button>
          </FooterActions>
        </PageBody>
      </div>
    )
  }

  const back = () => setDraft({ ...draft, step: 0 })
  const setCell = (date: IsoDate, productId: string, units: number | null) => {
    let day = { ...(draft.units[date] ?? {}) }
    if (units === null) day = Object.fromEntries(Object.entries(day).filter(([id]) => id !== productId))
    else day[productId] = units
    setDraft({ ...draft, units: { ...draft.units, [date]: day } })
  }

  async function suggest() {
    setSuggesting(true)
    try {
      const s = await projections.suggestions(draft.category, draft.start, draft.days, supervisor ? owner : undefined)
      const filled = s.days.filter((d) => Object.keys(d.units).length)
      if (!filled.length) return void toast('Aún no hay historial suficiente para sugerir.')
      const units = { ...draft.units }
      // Con un tamaño elegido, solo se sugieren sus productos; el resto queda como estaba.
      const visible = new Set(products.map((p) => p.id))
      for (const d of filled) {
        const picked = Object.entries(d.units).filter(([id]) => visible.has(id))
        units[d.date] = { ...units[d.date], ...Object.fromEntries(picked) }
      }
      setDraft({ ...draft, units })
      toast.success(`Sugerencia cargada (${filled.length} de ${draft.days} días). Revísala antes de enviar.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo obtener la sugerencia.')
    } finally {
      setSuggesting(false)
    }
  }

  function review() {
    if (closed.length) return void toast.error(closedDaysNote(closed))
    const tried = { ...draft, tried: true }
    setDraft(tried)
    if (!submittableDraft().safeParse(tried).success) return
    setReviewing(true)
  }

  async function send() {
    setReviewing(false)
    setSending(true)
    const started = Date.now()
    try {
      const outcome = await planning.submit(draft, loaded, owner, seller.username)
      await new Promise((r) => setTimeout(r, Math.max(0, 1200 - (Date.now() - started))))
      drafts.clear()
      await client.invalidateQueries({ queryKey: ['window'] })
      if (supervisor) {
        // El supervisor vuelve al detalle del día del equipo, donde ve el cambio.
        if (outcome.sync === 'ok') toast.success(`Proyección de ${ownerName} guardada.`)
        else toast(`Sin conexión: la proyección de ${ownerName} se enviará al reconectar.`)
        void navigate(paths.teamDay(draft.start))
        return
      }
      void navigate(paths.registered, { state: { outcome, draft } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar la proyección.')
    } finally {
      setSending(false)
    }
  }

  const suggestBtn = (
    <Button variant="ghost" disabled={suggesting} className="h-10 font-bold text-ink-2" onClick={suggest}>
      {suggesting ? <Loader2 className="animate-spin" /> : <Wand2 />} Sugerir con historial
    </Button>
  )

  return (
    <div>
      <PageHeader
        title="Nueva proyección"
        subtitle={supervisor ? `Para ${ownerName}, ${choiceLabel}` : `Proyección por producto, ${choiceLabel}`}
        mobileActions={<StepPill n={2} />}
        actions={suggestBtn}
      />
      <PageBody>
        <Section className="mb-3.5">
          <div className="flex flex-wrap items-end gap-x-7 gap-y-3 px-4 py-3 dsk:px-[18px] dsk:py-3.5">
            {supervisor && <Summary label="Vendedor" value={ownerName} />}
            <Summary label="Fecha de inicio" value={dFull(draft.start)} />
            <Summary label="Días de proyección" value={daysCount(draft.days)} />
            <Summary label="Categoría" value={choiceLabel} />
            <button type="button" className="ml-auto text-sm font-bold text-primary hover:underline" onClick={back}>
              Cambiar
            </button>
          </div>
        </Section>
        {invalid.length > 0 && (
          <Note tone="bad" icon={<AlertCircle />} className="mb-3.5 animate-shake">
            <div>Ingresa al menos un producto para {invalid.map(dShort).join(', ')}.</div>
          </Note>
        )}
        {mobile && dates.length > 3 && (
          <p className="mx-0.5 mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-primary">
            <ArrowRight className="size-4" /> Desliza la tabla para ver los {dates.length} días
          </p>
        )}
        <ProjectionMatrix
          draft={draft}
          dates={dates}
          products={products}
          invalid={invalid}
          mobile={mobile}
          onChange={setCell}
        />
        <div className="mx-1 mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <Info className="size-4" />
          <span className="flex-1">Ingresa solo las unidades. Los kilogramos se calculan automáticamente.</span>
          <span className="dsk:hidden">{suggestBtn}</span>
        </div>
        <FooterActions>
          <Button variant="ghost" className="h-10 flex-none font-bold text-ink-2" onClick={back}>
            <ChevronLeft /> Atrás
          </Button>
          <Button
            className="h-[54px] flex-1 rounded-[14px] text-[16.5px] font-bold dsk:min-w-[240px] dsk:flex-none"
            onClick={review}
          >
            Revisar y enviar <ArrowRight className="size-5" />
          </Button>
        </FooterActions>
      </PageBody>
      <ReviewDialog
        open={reviewing}
        mobile={mobile}
        draft={draft}
        dates={dates}
        catalog={catalog}
        onClose={() => setReviewing(false)}
        onConfirm={send}
      />
      <LoadingOverlay label={sending ? 'Enviando proyección' : null} />
    </div>
  )
}

function StepPill({ n }: { n: 1 | 2 }) {
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1.5 text-[13px] font-bold whitespace-nowrap text-primary">
      Paso {n} de 2
    </span>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small className="block text-[11.5px] font-semibold text-muted-foreground dsk:text-[13px]">{label}</small>
      <b className="text-[15px]">{value}</b>
    </div>
  )
}
