import { useCallback, useState } from 'react'
import { MessageCircle, Plus } from 'lucide-react'
import {
  ASSISTANT_CLOSE,
  ASSISTANT_LABEL,
  ASSISTANT_OPEN,
  AssistantPopup,
  useAssistantEnabled,
} from '@/features/assistant'
import { A11Y_LABEL } from '@/shared/types/appearance'
import { AccessibilityMenu } from '@/shared/ui/components/accessibility-menu'
import { cn } from '@/shared/ui/lib/utils'

const MORE_LABEL = 'Más opciones: asistente y accesibilidad'
const LESS_LABEL = 'Cerrar opciones'

/** Botón redondo de la pila (asistente, accesibilidad), con su nombre al lado en escritorio. */
const ROUND =
  'grid size-12 flex-none place-items-center rounded-full border border-border bg-surface text-foreground shadow-pop transition-colors hover:bg-muted hc:border-2 hc:border-foreground hc:shadow-none'

/**
 * Abajo a la derecha: un «+» que despliega el asistente y la accesibilidad. El asistente se abre
 * como ventana flotante sobre el botón (la conversación se conserva al cerrarla).
 */
export function FloatingActions() {
  const assistant = useAssistantEnabled()
  const [open, setOpen] = useState(false)
  const [chat, setChat] = useState(false)
  const closeChat = useCallback(() => setChat(false), [])
  return (
    <>
      {assistant && <AssistantPopup open={chat} onClose={closeChat} />}
      <div className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-3 dsk:right-6 dsk:bottom-6">
        {open && (
          <div className="flex animate-enter flex-col items-end gap-2.5">
            <div className="flex items-center gap-2">
              <span className="hidden rounded-md bg-surface px-2 py-1 text-sm font-medium shadow-sm dsk:inline">
                {A11Y_LABEL}
              </span>
              <AccessibilityMenu side="top" className={cn(ROUND, 'size-12 text-foreground')} />
            </div>
            {assistant && (
              <div className="flex items-center gap-2">
                <span className="hidden rounded-md bg-surface px-2 py-1 text-sm font-medium shadow-sm dsk:inline">
                  {ASSISTANT_LABEL}
                </span>
                <button
                  type="button"
                  aria-label={chat ? ASSISTANT_CLOSE : ASSISTANT_OPEN}
                  aria-pressed={chat}
                  title={ASSISTANT_LABEL}
                  onClick={() => {
                    setChat(!chat)
                    setOpen(false)
                  }}
                  className={cn(ROUND, chat && 'border-primary bg-selected text-selected-foreground')}
                >
                  <MessageCircle aria-hidden className="size-5" />
                </button>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          aria-expanded={open || chat}
          aria-label={chat ? ASSISTANT_CLOSE : open ? LESS_LABEL : MORE_LABEL}
          title={chat ? ASSISTANT_CLOSE : open ? LESS_LABEL : MORE_LABEL}
          // Con el chat abierto, el botón lo cierra; si no, despliega o recoge las opciones.
          onClick={() => (chat ? setChat(false) : setOpen(!open))}
          className="grid size-14 place-items-center rounded-full bg-primary dsk:size-12 text-primary-foreground shadow-pop transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hc:border-2 hc:border-foreground hc:shadow-none"
        >
          <Plus aria-hidden className={cn('size-6 transition-transform duration-200', (open || chat) && 'rotate-45')} />
        </button>
      </div>
    </>
  )
}
