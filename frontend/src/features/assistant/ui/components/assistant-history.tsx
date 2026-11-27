import { MessageCircle, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/shared/ui/components/confirm-dialog'
import { relativeTime, type ConversationSummary } from '@/features/assistant/domain/assistant'
import { useConversations, useDeleteConversation } from '@/features/assistant/ui/hooks'
import {
  ASSISTANT_DELETE,
  ASSISTANT_DELETE_DESCRIPTION,
  ASSISTANT_DELETE_FAILED,
  ASSISTANT_DELETE_TITLE,
  ASSISTANT_HISTORY_EMPTY,
  ASSISTANT_HISTORY_FAILED,
  ASSISTANT_HISTORY_LOADING,
  ASSISTANT_HISTORY_TITLE,
  ASSISTANT_UNTITLED,
  channelName,
} from '@/features/assistant/types/assistant'

function ChannelIcon({ channel }: { channel: ConversationSummary['channel'] }) {
  if (channel === 'app') return null
  const Icon = channel === 'telegram' ? Send : MessageCircle
  return <Icon aria-label={channelName(channel)} role="img" className="size-3.5 flex-none text-muted-foreground" />
}

/** Lista de conversaciones: abrir una la retoma; el tacho la borra (con confirmación). */
export function AssistantHistory({
  username,
  current,
  onOpen,
  onDeleted,
}: {
  username: string
  current: string
  onOpen: (id: string) => void
  onDeleted: (id: string) => void
}) {
  const list = useConversations(username, true)
  const remove = useDeleteConversation(username)

  return (
    <section aria-labelledby="assistant-history-title" className="grid gap-3">
      <h3 id="assistant-history-title" className="text-sm font-bold">
        {ASSISTANT_HISTORY_TITLE}
      </h3>
      {list.isPending && <p className="text-sm text-muted-foreground">{ASSISTANT_HISTORY_LOADING}</p>}
      {list.isError && <p className="text-sm text-bad">{ASSISTANT_HISTORY_FAILED}</p>}
      {list.data?.length === 0 && <p className="text-sm text-muted-foreground">{ASSISTANT_HISTORY_EMPTY}</p>}
      <ul className="grid gap-2">
        {list.data?.map((c) => (
          <li
            key={c.id}
            className="flex items-stretch gap-1 rounded-md border border-border bg-surface hc:border-foreground"
          >
            <button
              type="button"
              onClick={() => onOpen(c.id)}
              aria-current={c.id === current ? 'true' : undefined}
              className="min-w-0 flex-1 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="flex items-center gap-1.5">
                <ChannelIcon channel={c.channel} />
                <span className="truncate text-sm font-bold">{c.title || ASSISTANT_UNTITLED}</span>
              </span>
              <span className="block text-xs text-muted-foreground">{relativeTime(c.updated_at)}</span>
              {c.preview && <span className="block truncate text-xs text-ink-2">{c.preview}</span>}
            </button>
            <ConfirmDialog
              title={ASSISTANT_DELETE_TITLE}
              description={ASSISTANT_DELETE_DESCRIPTION}
              confirmLabel={ASSISTANT_DELETE}
              destructive
              onConfirm={async () => {
                try {
                  await remove.mutateAsync(c.id)
                  onDeleted(c.id)
                } catch {
                  toast.error(ASSISTANT_DELETE_FAILED)
                }
              }}
              trigger={(open) => (
                <button
                  type="button"
                  onClick={open}
                  aria-label={`${ASSISTANT_DELETE}: ${c.title || ASSISTANT_UNTITLED}`}
                  title={ASSISTANT_DELETE}
                  className="grid size-10 flex-none place-items-center self-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-bad focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              )}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
