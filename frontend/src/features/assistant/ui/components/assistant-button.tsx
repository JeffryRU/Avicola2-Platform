import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react'
import { ArrowLeft, History, Smartphone, SquarePen, SendHorizontal, X } from 'lucide-react'
import { toast } from 'sonner'
import { useRequiredSession } from '@/features/auth'
import { ApiError } from '@/shared/application/ports'
import { cn } from '@/shared/ui/lib/utils'
import {
  currentSuggestions,
  lastSuggestions,
  MAX_MESSAGE,
  sendable,
  toChatMessages,
  type ChatMessage,
} from '@/features/assistant/domain/assistant'
import { AssistantBlocks } from '@/features/assistant/ui/components/assistant-blocks'
import { AssistantHistory } from '@/features/assistant/ui/components/assistant-history'
import { AssistantLink } from '@/features/assistant/ui/components/assistant-link'
import {
  useAskAssistant,
  useAssistantInfo,
  useOpenConversation,
  useRefreshConversations,
  useRememberedConversation,
} from '@/features/assistant/ui/hooks'
import {
  ASSISTANT_CLOSE,
  ASSISTANT_BACK,
  ASSISTANT_DESCRIPTION,
  ASSISTANT_FAILED,
  ASSISTANT_HISTORY,
  ASSISTANT_NEW,
  ASSISTANT_NOTE,
  ASSISTANT_OPEN_FAILED,
  ASSISTANT_PLACEHOLDER,
  ASSISTANT_SEND,
  ASSISTANT_START,
  ASSISTANT_SUGGESTIONS,
  ASSISTANT_THINKING,
  ASSISTANT_TITLE,
  ASSISTANT_TOOLBAR,
  LINK_OPEN,
} from '@/features/assistant/types/assistant'

/** Mensajes del servidor que se muestran tal cual (límite, no disponible, pregunta inválida). */
const SHOWN_STATUSES = new Set([422, 429, 503])

const errorText = (e: unknown) =>
  e instanceof ApiError && SHOWN_STATUSES.has(e.status) && e.message ? e.message : ASSISTANT_FAILED

/**
 * Ventana flotante del asistente (ADR 0022), abajo a la derecha, sobre el botón «+». Lo ve todo
 * el que tenga sesión cuando el backend tiene asistente; cada uno solo consulta lo suyo. Ofrece
 * preguntas para tocar: las de inicio según el rol y, después de cada respuesta, las que propone
 * el asistente. Al cerrarla la conversación se conserva (sigue montada, oculta).
 */
export function AssistantPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { seller } = useRequiredSession()
  const info = useAssistantInfo(seller.username)
  const ask = useAskAssistant()
  const openConversation = useOpenConversation()
  const refreshHistory = useRefreshConversations(seller.username)
  const remembered = useRememberedConversation(seller.username)
  const [view, setView] = useState<'chat' | 'history' | 'link'>('chat')
  const restored = useRef(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [latest, setLatest] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [conversation, setConversation] = useState<string>(() => crypto.randomUUID())
  const nextId = useRef(1)
  const bottom = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const titleId = useId()

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages, ask.isPending])

  // Al abrir, el cursor va a la caja de texto; con Escape se cierra.
  useEffect(() => {
    if (!open) return
    input.current?.focus()
    // Un diálogo de dentro (tabla ampliada, confirmación) maneja su Escape y lo marca como atendido.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /** Carga una conversación guardada y sigue con ella. */
  function load(id: string, silent = false) {
    openConversation.mutate(id, {
      onSuccess: (detail) => {
        const list = toChatMessages(detail, nextId.current)
        nextId.current += list.length
        setMessages(list)
        setLatest(lastSuggestions(detail))
        setConversation(detail.id)
        remembered.write(detail.id)
        setView('chat')
      },
      onError: () => {
        if (silent) remembered.clear()
        else toast.error(ASSISTANT_OPEN_FAILED)
      },
    })
  }

  const enabled = info.data?.enabled === true
  // Al recargar, retoma la conversación que estaba abierta (si el servidor ya no la tiene, empieza de cero).
  useEffect(() => {
    if (!enabled || restored.current) return
    restored.current = true
    const id = remembered.read()
    if (id) load(id, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  if (!info.data?.enabled) return null
  const starters = info.data.suggestions
  const suggestions = ask.isPending ? [] : currentSuggestions(messages, starters, latest)

  const add = (from: ChatMessage['from'], text: string) =>
    setMessages((list) => [...list, { id: nextId.current++, from, text }])

  const send = (raw: string) => {
    const message = sendable(raw)
    if (!message || ask.isPending) return
    setView('chat')
    remembered.write(conversation)
    add('user', message)
    setDraft('')
    // La respuesta se va escribiendo en su burbuja; al terminar se reemplaza por la final.
    const id = nextId.current++
    const write = (patch: Partial<ChatMessage>) =>
      setMessages((list) =>
        list.some((m) => m.id === id)
          ? list.map((m) => (m.id === id ? { ...m, ...patch } : m))
          : [...list, { id, from: 'assistant', text: '', ...patch }],
      )
    let text = ''
    ask.mutate(
      {
        message,
        conversation,
        onDelta: (delta) => {
          text += delta
          write({ text })
        },
      },
      {
        onSuccess: (r) => {
          write({ from: 'assistant', text: r.reply, messageId: r.message_id ?? undefined, blocks: r.blocks })
          setLatest(r.suggestions)
          void refreshHistory()
        },
        onError: (e) => write({ from: 'error', text: errorText(e) }),
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
    remembered.clear()
    setView('chat')
    input.current?.focus()
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={cn(
        'fixed inset-x-2 top-16 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-pop',
        'dsk:inset-x-auto dsk:top-auto dsk:right-6 dsk:bottom-24 dsk:h-[min(36rem,calc(100dvh-8rem))] dsk:w-[26rem]',
        'origin-bottom-right animate-enter hc:border-2 hc:border-foreground hc:shadow-none',
        // Oculta (no desmontada): la conversación sigue al volver a abrir. Va al final para ganarle a «flex».
        !open && 'hidden',
      )}
    >
      <header className="flex items-start gap-2 border-b border-border bg-chrome px-4 py-3 text-chrome-foreground hc:border-b-2 hc:border-foreground">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-md font-bold hc:font-extrabold">
            {ASSISTANT_TITLE}
          </h2>
          <p className="text-xs text-chrome-muted">{ASSISTANT_DESCRIPTION}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={ASSISTANT_CLOSE}
          title={ASSISTANT_CLOSE}
          className="grid size-9 flex-none place-items-center rounded-md text-chrome-muted transition-colors hover:bg-chrome-hover hover:text-chrome-foreground"
        >
          <X aria-hidden className="size-5" />
        </button>
      </header>

      <div
        role="toolbar"
        aria-label={ASSISTANT_TOOLBAR}
        className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-1.5 hc:border-b-2 hc:border-foreground"
      >
        {view === 'chat' ? (
          <ToolbarButton icon={History} label={ASSISTANT_HISTORY} onClick={() => setView('history')} />
        ) : (
          <ToolbarButton icon={ArrowLeft} label={ASSISTANT_BACK} onClick={() => setView('chat')} />
        )}
        <ToolbarButton
          icon={SquarePen}
          label={ASSISTANT_NEW}
          onClick={restart}
          disabled={ask.isPending || (!messages.length && view === 'chat')}
        />
        <ToolbarButton icon={Smartphone} label={LINK_OPEN} onClick={() => setView('link')} pressed={view === 'link'} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {view === 'history' && (
          <AssistantHistory
            username={seller.username}
            current={conversation}
            onOpen={(id) => load(id)}
            onDeleted={(id) => id === conversation && restart()}
          />
        )}
        {view === 'link' && <AssistantLink />}
        {view === 'chat' && !messages.length && <p className="text-sm text-muted-foreground">{ASSISTANT_START}</p>}
        <ul className={cn('grid gap-3', view !== 'chat' && 'hidden')}>
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                'rounded-lg px-3 py-2 text-base',
                m.from === 'assistant' && m.blocks?.some((b) => b.type === 'table') ? 'max-w-full' : 'max-w-[85%]',
                m.from === 'user' && 'justify-self-end bg-primary text-primary-foreground',
                m.from === 'assistant' && 'justify-self-start bg-muted text-foreground hc:border hc:border-foreground',
                m.from === 'error' && 'justify-self-start bg-bad-soft text-bad hc:text-foreground',
              )}
            >
              {m.from === 'assistant' ? (
                <AssistantBlocks message={m} busy={ask.isPending} onAsk={send} />
              ) : (
                <p className="whitespace-pre-line">{m.text}</p>
              )}
            </li>
          ))}
          {/* «Pensando…» solo hasta que empieza a llegar el texto. */}
          {ask.isPending && messages.at(-1)?.from === 'user' && (
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
        {view === 'chat' && suggestions.length > 0 && (
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
        <form onSubmit={submit} className={cn('flex items-center gap-2', view !== 'chat' && 'hidden')}>
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
    </section>
  )
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  pressed,
}: {
  icon: typeof History
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={label}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-ink-2 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 aria-pressed:bg-selected hc:text-foreground"
    >
      <Icon aria-hidden className="size-4" />
      <span>{label}</span>
    </button>
  )
}
