import { AlertCircle, BarChart3, Box, Check, ShoppingCart } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { paths } from '@/app/routes'
import { addDays, today, weekStart } from '@/core/domain/dates'
import type { AppNotification, NotificationKind } from '@/modules/planning/domain/notifications'
import { useNotifications } from '@/modules/planning/ui/notifications'
import { PageBody, PageHeader, Section } from '@/ui/components/layout'
import { Button } from '@/ui/components/shadcn/button'
import { cn } from '@/ui/lib/utils'

const LOOK: Record<NotificationKind, { icon: typeof Box; cls: string }> = {
  pending: { icon: AlertCircle, cls: 'bg-bad-soft text-destructive' },
  sales: { icon: ShoppingCart, cls: 'bg-ok-soft text-ok' },
  summary: { icon: BarChart3, cls: 'bg-secondary text-primary' },
  catalog: { icon: Box, cls: 'bg-[#EDE9FE] text-[#6D28D9]' },
}

export function NotificationsPage() {
  const { list, unread, markRead } = useNotifications()
  const navigate = useNavigate()

  const open = (n: AppNotification) => {
    markRead([n.id])
    const target = {
      pending: paths.day(today()),
      sales: paths.dashVersus,
      summary: `${paths.dashSummary}?semana=${addDays(weekStart(today()), -7)}`,
      catalog: paths.products,
    }[n.kind]
    navigate(target)
  }

  const readAll = unread.length > 0 && (
    <Button
      variant="ghost"
      className="h-10 font-bold text-ink-2"
      onClick={() => {
        markRead(list.map((n) => n.id))
        toast.success('Notificaciones marcadas como leídas')
      }}
    >
      <Check /> Marcar todo como leído
    </Button>
  )

  return (
    <div>
      <PageHeader
        title="Notificaciones"
        actions={readAll}
        mobileActions={
          readAll && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Marcar todo como leído"
              onClick={() => markRead(list.map((n) => n.id))}
            >
              <Check />
            </Button>
          )
        }
      />
      <PageBody>
        <Section className="grid overflow-hidden">
          {list.map((n) => {
            const isUnread = unread.some((u) => u.id === n.id)
            const { icon: Icon, cls } = LOOK[n.kind]
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={cn(
                  'grid w-full grid-cols-[42px_1fr_auto] items-start gap-3.5 border-b border-muted px-5 py-4 text-left',
                  isUnread && 'bg-[#F8FBFF]',
                )}
              >
                <span className={cn('grid size-[42px] place-items-center rounded-xl', cls)}>
                  <Icon className="size-5" />
                </span>
                <span>
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
                <small className="whitespace-nowrap text-muted-foreground">{n.when}</small>
              </button>
            )
          })}
        </Section>
      </PageBody>
    </div>
  )
}
