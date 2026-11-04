import { AlertCircle, Bell, Check, ClipboardCheck, Loader2, LockOpen, Megaphone } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
  safeLink,
  whenLabel,
  type AppNotification,
  type NotificationKind,
} from '@/features/notifications/domain/notifications'
import { useMarkRead, useNotifications } from '@/features/notifications/ui/hooks'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'

const LOOK: Record<NotificationKind, { icon: typeof Bell; cls: string }> = {
  projection_reminder: { icon: AlertCircle, cls: 'bg-bad-soft text-destructive' },
  projection_submitted: { icon: ClipboardCheck, cls: 'bg-secondary text-primary' },
  announcement: { icon: Megaphone, cls: 'bg-ok-soft text-ok' },
  edit_requested: { icon: LockOpen, cls: 'bg-warn-soft text-warn' },
  edit_decided: { icon: LockOpen, cls: 'bg-secondary text-primary' },
}
const GENERIC = { icon: Bell, cls: 'bg-muted text-ink-2' }

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
    <Button variant="ghost" className="h-10 font-bold text-ink-2" onClick={readAll}>
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
            <div className="grid place-items-center p-10">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <EmptyState title="No se pudieron cargar">{error.message}</EmptyState>
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
                  className={cn(
                    'grid w-full grid-cols-[42px_1fr_auto] items-start gap-3.5 border-b border-muted px-5 py-4 text-left last:border-0',
                    isUnread && 'bg-[#F8FBFF]',
                  )}
                >
                  <span className={cn('grid size-[42px] place-items-center rounded-xl', cls)}>
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <b className="block">
                      {n.title}
                      {isUnread && (
                        <i
                          className="ml-2 inline-block size-2 rounded-full bg-primary align-[2px]"
                          aria-label="sin leer"
                        />
                      )}
                    </b>
                    <p className="mt-0.5 text-sm text-ink-2">{n.body}</p>
                  </span>
                  <small className="whitespace-nowrap text-muted-foreground">{whenLabel(n.created_at)}</small>
                </button>
              )
            })
          )}
        </Section>
      </PageBody>
    </div>
  )
}
