import { MessageCircle } from 'lucide-react'
import { useContainer } from '@/app/di'
import { useRequiredSession } from '@/features/auth'
import { hasTeamView } from '@/shared/domain/session'
import { ASSISTANT_LABEL, ASSISTANT_TITLE } from '@/shared/types/labels'
import { cn } from '@/shared/ui/lib/utils'

/**
 * Botón flotante del asistente (el chat de n8n, ADR 0017). Solo para supervisión: el agente ve
 * todo el equipo. Sin `VITE_ASSISTANT_URL` no aparece. El chat pide su propio usuario y
 * contraseña y se abre en otra pestaña (n8n no se deja incrustar).
 */
export function AssistantButton() {
  const { assistantUrl } = useContainer()
  const session = useRequiredSession()
  if (!assistantUrl || !hasTeamView(session)) return null
  return (
    <a
      href={assistantUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={ASSISTANT_TITLE}
      aria-label={ASSISTANT_TITLE}
      className={cn(
        'fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg transition-transform',
        'size-touch justify-center hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'dsk:right-6 dsk:bottom-6 dsk:h-11 dsk:w-auto dsk:px-4',
        'hc:border-2 hc:border-foreground hc:shadow-none',
      )}
    >
      <MessageCircle aria-hidden className="size-5" />
      <span className="hidden text-base font-medium dsk:inline">{ASSISTANT_LABEL}</span>
    </a>
  )
}
