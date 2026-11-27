import { AlertCircle, Bell, CalendarX, Check, ClipboardCheck, Loader2, LockOpen, Megaphone } from 'lucide-react'
import { useId, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import {
  RANGE_PRESETS,
  byDay,
  presetOf,
  presetRange,
  safeLink,
  whenLabel,
  type AppNotification,
  type NotificationKind,
  type NotificationRange,
} from '@/features/notifications/domain/notifications'
import {
  CLEAR_LABEL,
  EMPTY_RANGE_BODY,
  EMPTY_RANGE_TITLE,
  FILTER_LABEL,
  FROM_LABEL,
  RANGE_LABEL,
  TODAY_LABEL,
  TO_LABEL,
  YESTERDAY_LABEL,
  countLabel,
} from '@/features/notifications/types/notifications'
import { addDays, dShort, today as todayIso, type IsoDate } from '@/shared/domain/dates'
import { isoDateSchema } from '@/shared/domain/schemas'
import { Segmented } from '@/shared/ui/components/segmented'
import { Input } from '@/shared/ui/components/shadcn/input'
import { useMarkRead, useNotifications } from '@/features/notifications/ui/hooks'
import { EmptyState, ErrorState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'

/** Ícono pequeño por tipo; solo lo que pide acción lleva color (ámbar). */
const LOOK: Record<NotificationKind, { icon: typeof Bell; cls: string }> = {
  projection_reminder: { icon: AlertCircle, cls: 'text-warn' },
  projection_submitted: { icon: ClipboardCheck, cls: 'text-muted-foreground' },
  announcement: { icon: Megaphone, cls: 'text-muted-foreground' },
  edit_requested: { icon: LockOpen, cls: 'text-warn' },
  edit_decided: { icon: LockOpen, cls: 'text-muted-foreground' },
  projection_missed: { icon: CalendarX, cls: 'text-warn' },
}
const GENERIC = { icon: Bell, cls: 'text-muted-foreground' }

/** Rango de la URL (?desde=…&hasta=…); sin fechas válidas, null (todas). */
function rangeFromParams(params: URLSearchParams): NotificationRange | null {
  const from = isoDateSchema.safeParse(params.get('desde'))
  const to = isoDateSchema.safeParse(params.get('hasta'))
  const a = from.success ? from.data : to.success ? to.data : null
  if (!a) return null
  const b = to.success ? to.data : a
  return a <= b ? { from: a, to: b } : { from: b, to: a }
}

/** Filtro por día: atajos (hoy, ayer, 7 días) o un rango con dos fechas. */
function DayFilter({
  range,
  onChange,
  count,
}: {
  range: NotificationRange | null
  onChange: (r: NotificationRange | null) => void
  count: number | null
}) {
  const today = todayIso()
  // «Elegir fechas» queda marcado aunque las fechas elegidas coincidan con un atajo.
  const [choosing, setChoosing] = useState(false)
  const preset = choosing && range ? 'custom' : presetOf(range, today)
  const id = useId()
  const pick = (p: (typeof RANGE_PRESETS)[number]) => {
    setChoosing(p === 'custom')
    if (p === 'custom') onChange(range ?? { from: addDays(today, -6), to: today })
    else onChange(presetRange(p, today))
  }
  const setFrom = (from: string) =>
    isoDateSchema.safeParse(from).success && onChange({ from, to: range && range.to >= from ? range.to : from })
  const setTo = (to: string) =>
    isoDateSchema.safeParse(to).success && onChange({ from: range && range.from <= to ? range.from : to, to })
  return (
    <div className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-2">
      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">{FILTER_LABEL}</span>
        <Segmented
          value={preset}
          onChange={pick}
          options={RANGE_PRESETS.map((p) => ({ value: p, label: RANGE_LABEL[p] }))}
        />
      </div>
      {preset === 'custom' && range && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1" htmlFor={`${id}-from`}>
            <span className="text-xs font-medium text-muted-foreground">{FROM_LABEL}</span>
            <Input
              id={`${id}-from`}
              type="date"
              value={range.from}
              max={today}
              onChange={(e) => setFrom(e.target.value)}
              className="w-44"
            />
          </label>
          <label className="grid gap-1" htmlFor={`${id}-to`}>
            <span className="text-xs font-medium text-muted-foreground">{TO_LABEL}</span>
            <Input
              id={`${id}-to`}
              type="date"
              value={range.to}
              min={range.from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="w-44"
            />
          </label>
        </div>
      )}
      {range && count != null && (
        <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {countLabel(count)}
        </span>
      )}
    </div>
  )
}

/** Título de un grupo de un día: «Hoy», «Ayer» o la fecha completa. */
const dayTitle = (day: IsoDate) => {
  const today = todayIso()
  return day === today ? TODAY_LABEL : day === addDays(today, -1) ? YESTERDAY_LABEL : dShort(day)
}

export function NotificationsPage() {
  const [params, setParams] = useSearchParams()
  const range = rangeFromParams(params)
  const setRange = (r: NotificationRange | null) =>
    setParams(r ? { desde: r.from, hasta: r.to } : {}, { replace: true })
  const { items, unread, isPending, error } = useNotifications(range)
  const markRead = useMarkRead()
  const navigate = useNavigate()

  const open = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate([n.id])
    const link = safeLink(n.link)
    if (link) void navigate(link)
  }
  const readAll = () =>
    markRead.mutate(undefined, { onSuccess: () => toast.success('Notificaciones marcadas como leídas') })

  const readAllButton = unread > 0 && (
    <Button variant="outline" onClick={readAll}>
      <Check /> Marcar todo como leído
    </Button>
  )

  return (
    <div>
      <PageHeader
        title="Notificaciones"
        subtitle={unread ? `${unread} sin leer` : undefined}
        actions={readAllButton}
        mobileActions={
          unread > 0 && (
            <Button variant="ghost" size="icon" aria-label="Marcar todo como leído" onClick={readAll}>
              <Check />
            </Button>
          )
        }
      />
      <PageBody>
        <DayFilter range={range} onChange={setRange} count={isPending || error ? null : items.length} />
        <Section className="grid overflow-hidden">
          {isPending ? (
            <div role="status" className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando notificaciones…
            </div>
          ) : error ? (
            <ErrorState title="No se pudieron cargar las notificaciones" detail={error.message} />
          ) : items.length === 0 && range ? (
            <EmptyState title={EMPTY_RANGE_TITLE}>
              {EMPTY_RANGE_BODY}
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => setRange(null)}>
                  {CLEAR_LABEL}
                </Button>
              </div>
            </EmptyState>
          ) : items.length === 0 ? (
            <EmptyState title="No tienes notificaciones">
              Aquí aparecerán los recordatorios de proyección, los envíos de tu equipo y los avisos de la empresa,
              apenas ocurran.
            </EmptyState>
          ) : (
            byDay(items).map((group) => (
              <div key={group.day} role="group" aria-label={dayTitle(group.day)}>
                <h2 className="sticky top-0 z-10 border-b border-rule bg-muted px-4 py-1.5 text-xs font-semibold text-ink-2 dsk:px-5">
                  {dayTitle(group.day)}
                </h2>
                {group.items.map((n) => {
                  const { icon: Icon, cls } = LOOK[n.kind as NotificationKind] ?? GENERIC
                  const isUnread = !n.read_at
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => open(n)}
                      className="grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-3 border-b border-rule px-4 py-3.5 text-left transition-colors last:border-0 hover:bg-muted dsk:px-5"
                    >
                      <Icon className={cn('mt-0.5 size-4.5', cls)} aria-hidden />
                      <span className="min-w-0">
                        <b
                          className={cn(
                            'flex items-center gap-2',
                            isUnread ? 'font-semibold' : 'font-normal text-ink-2',
                          )}
                        >
                          {n.title}
                          {isUnread && (
                            <i className="size-2 flex-none rounded-full bg-primary" aria-label="sin leer" role="img" />
                          )}
                        </b>
                        <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                      </span>
                      <small className="num text-xs whitespace-nowrap text-muted-foreground">
                        {whenLabel(n.created_at)}
                      </small>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </Section>
      </PageBody>
    </div>
  )
}
