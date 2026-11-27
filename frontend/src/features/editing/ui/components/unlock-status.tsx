import type { Unlock } from '@/features/editing/domain/editing'
import { UNLOCK_STATUS_LABEL } from '@/features/editing/types/editing'
import { StatusDot } from '@/shared/ui/components/feedback'
import { cn } from '@/shared/ui/lib/utils'

/** Estado de una solicitud con punto y texto (sin pastilla de color). */
export function UnlockStatus({ status }: { status: Unlock['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm whitespace-nowrap',
        status === 'requested' && 'font-medium text-warn hc:font-bold',
        status === 'rejected' && 'text-bad',
        status === 'closed' && 'text-muted-foreground',
      )}
    >
      <StatusDot
        tone={status === 'approved' ? 'ok' : status === 'requested' ? 'warn' : status === 'rejected' ? 'bad' : 'draft'}
      />
      {UNLOCK_STATUS_LABEL[status]}
    </span>
  )
}
