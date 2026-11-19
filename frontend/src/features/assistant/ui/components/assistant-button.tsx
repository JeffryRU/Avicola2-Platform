import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { MessageCircle, RotateCcw, SendHorizontal } from 'lucide-react'
import { useRequiredSession } from '@/features/auth'
import { ApiError } from '@/shared/application/ports'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/components/shadcn/sheet'
import { cn } from '@/shared/ui/lib/utils'
import { currentSuggestions, MAX_MESSAGE, sendable, type ChatMessage } from '@/features/assistant/domain/assistant'
import { useAskAssistant, useAssistantInfo } from '@/features/assistant/ui/hooks'
import {
  ASSISTANT_DESCRIPTION,
  ASSISTANT_FAILED,
  ASSISTANT_LABEL,
  ASSISTANT_NEW,
  ASSISTANT_NOTE,
  ASSISTANT_OPEN,
  ASSISTANT_PLACEHOLDER,
  ASSISTANT_SEND,
  ASSISTANT_START,
  ASSISTANT_SUGGESTIONS,
  ASSISTANT_THINKING,
  ASSISTANT_TITLE,
} from '@/features/assistant/types/assistant'

/** Mensajes del servidor que se muestran tal cual (límite, no disponible, pregunta inválida). */
const SHOWN_STATUSES = new Set([422, 429, 503])

const errorText = (e: unknown) =>
  e instanceof ApiError && SHOWN_STATUSES.has(e.status) && e.message ? e.message : ASSISTANT_FAILED

/**
 * Botón flotante y panel del asistente (ADR 0022). Lo ve todo el que tenga sesión cuando el
 * backend tiene asistente; cada uno solo consulta lo suyo. Ofrece preguntas para tocar: las de
 * inicio según el rol y, después de cada respuesta, las que propone el asistente.
 */
export function AssistantButton() {
  const { seller } = useRequiredSession()
  const info = useAssistantInfo(seller.username)
  const ask = useAskAssistant()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [latest, setLatest] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [conversation, setConversation] = useState(() => crypto.randomUUID())
  const nextId = useRef(1)
  const bottom = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages, ask.isPending])

  if (!info.data?.enabled) return null
  const starters = info.data.suggestions
  const suggestions = ask.isPending ? [] : currentSuggestions(messages, starters, latest)

  const add = (from: ChatMessage['from'], text: string) =>
    setMessages((list) => [...list, { id: nextId.current++, from, text }])

  const send = (raw: string) => {
    const message = sendable(raw)
    if (!message || ask.isPending) return
    add('user', message)
    setDraft('')
    ask.mutate(
      { message, conversation },
      {
        onSuccess: (r) => {
          add('assistant', r.reply)
          setLatest(r.suggestions)
        },
        onError: (e) => add('error', errorText(e)),
      },
    )
  }

  const submit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    send(draft)
  }

  const restart = () => {
    setMessages([])
    setLatest([])
    setDraft('')
    setConversation(crypto.randomUUID())
    input.current?.focus()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ASSISTANT_OPEN}
        title={ASSISTANT_OPEN}
        className={cn(
          'fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg transition-transform',
          'size-touch justify-center hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          'dsk:right-6 dsk:bottom-6 dsk:h-11 dsk:w-auto dsk:px-4',
          'hc:border-2 hc:border-foreground hc:shadow-none',
        )}
      >
        <MessageCircle aria-hidden className="size-5" />
        <span className="hidden text-base font-medium dsk:inline">{ASSISTANT_LABEL}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:max-w-md hc:border-l-2 hc:border-foreground"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            input.current?.focus()
          }}
        >
          <SheetHeader className="border-b border-border px-4 py-3 pr-24 hc:border-b-2 hc:border-foreground">
            <SheetTitle className="text-lg font-semibold hc:font-extrabold">{ASSISTANT_TITLE}</SheetTitle>
            <SheetDescription className="text-sm">{ASSISTANT_DESCRIPTION}</SheetDescription>
          </SheetHeader>
          <button
            type="button"
            onClick={restart}
            disabled={!messages.length || ask.isPending}
            aria-label={ASSISTANT_NEW}
            title={ASSISTANT_NEW}
            className="absolute top-2 right-14 grid size-touch place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <RotateCcw aria-hidden className="size-5" />
          </button>

          <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
            {!messages.length && <p className="text-sm text-muted-foreground">{ASSISTANT_START}</p>}
            <ul className="grid gap-3">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-base whitespace-pre-line',
                    m.from === 'user' && 'justify-self-end bg-primary text-primary-foreground',
                    m.from === 'assistant' &&
                      'justify-self-start bg-muted text-foreground hc:border hc:border-foreground',
                    m.from === 'error' && 'justify-self-start bg-bad-soft text-bad hc:text-foreground',
                  )}
                >
                  {m.text}
                </li>
              ))}
              {ask.isPending && (
                <li
                  className="justify-self-start rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
                  role="status"
                >
                  {ASSISTANT_THINKING}
                </li>
              )}
            </ul>
            <div ref={bottom} />
          </div>

          <div className="border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] hc:border-t-2 hc:border-foreground">
            {suggestions.length > 0 && (
              <div role="group" aria-label={ASSISTANT_SUGGESTIONS} className="mb-3 flex flex-wrap gap-2">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="min-h-9 rounded-full border border-border bg-surface px-3 py-1 text-left text-sm text-ink-2 transition-colors hover:border-primary hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring hc:border-foreground hc:font-semibold hc:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={submit} className="flex items-center gap-2">
              <input
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_MESSAGE}
                placeholder={ASSISTANT_PLACEHOLDER}
                aria-label={ASSISTANT_PLACEHOLDER}
                className="h-touch min-w-0 flex-1 rounded-md border-control border-input bg-surface px-3 text-md outline-none placeholder:text-faint focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring dsk:h-10 dsk:text-base"
              />
              <button
                type="submit"
                disabled={!sendable(draft) || ask.isPending}
                aria-label={ASSISTANT_SEND}
                title={ASSISTANT_SEND}
                className="grid size-touch flex-none place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-40 dsk:size-10"
              >
                <SendHorizontal aria-hidden className="size-5" />
              </button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">{ASSISTANT_NOTE}</p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
