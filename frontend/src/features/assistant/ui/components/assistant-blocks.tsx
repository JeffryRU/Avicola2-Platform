import { messageBlocks, type ChatMessage } from '@/features/assistant/domain/assistant'
import { AssistantTable } from '@/features/assistant/ui/components/assistant-table'

/** El contenido de una respuesta: texto y tablas en el orden en que llegaron. */
export function AssistantBlocks({
  message,
  busy,
  onAsk,
}: {
  message: ChatMessage
  busy: boolean
  onAsk: (question: string) => void
}) {
  const blocks = messageBlocks(message)
  return (
    <div className="grid gap-2">
      {blocks.map((b, i) => {
        if (b.type === 'text') {
          return b.text.trim() ? (
            <p key={i} className="whitespace-pre-line">
              {b.text}
            </p>
          ) : null
        }
        // Posición entre las tablas del mensaje (la que usa el servidor para el Excel).
        const tableIndex = blocks.slice(0, i).filter((x) => x.type === 'table').length
        return (
          <AssistantTable
            key={i}
            table={b}
            index={tableIndex}
            messageId={message.messageId}
            busy={busy}
            onAsk={onAsk}
          />
        )
      })}
    </div>
  )
}
