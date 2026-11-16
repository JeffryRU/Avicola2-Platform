import { AlertCircle, Bell, CalendarX, Check, ClipboardCheck, Loader2, LockOpen, Megaphone } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
  safeLink,
  whenLabel,
  type AppNotification,
  type NotificationKind,
} from '@/features/notifications/domain/notifications'
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

export function NotificationsPage() {
  const { items, unread, isPending, error } = useNotifications()
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
        <Section className="grid overflow-hidden">
          {isPending ? (
            <div role="status" className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando notificaciones…
            </div>
          ) : error ? (
            <ErrorState title="No se pudieron cargar las notificaciones" detail={error.message} />
          ) : items.length === 0 ? (
            <EmptyState title="No tienes notificaciones">
              Aquí aparecerán los recordatorios de proyección, los envíos de tu equipo y los avisos de la empresa,
              apenas ocurran.
            </EmptyState>
          ) : (
            items.map((n) => {
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
                    <b className={cn('flex items-center gap-2', isUnread ? 'font-semibold' : 'font-normal text-ink-2')}>
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
            })
          )}
        </Section>
      </PageBody>
    </div>
  )
}
