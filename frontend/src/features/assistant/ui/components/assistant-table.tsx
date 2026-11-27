import { useState } from 'react'
import { Download, Loader2, Maximize2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/shared/ui/lib/utils'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog'
import { numericColumns, tableQuestions, type TableBlock } from '@/features/assistant/domain/assistant'
import { useDownloadTable } from '@/features/assistant/ui/hooks'
import {
  TABLE_ASK_GROUP,
  TABLE_DIALOG_DESCRIPTION,
  TABLE_DOWNLOAD,
  TABLE_DOWNLOADING,
  TABLE_DOWNLOAD_FAILED,
  TABLE_EXPAND,
  TABLE_UNTITLED,
} from '@/features/assistant/types/assistant'

/** La tabla en sí: desplazamiento horizontal si no cabe y números a la derecha. */
function TableGrid({ table, large }: { table: TableBlock; large?: boolean }) {
  const numeric = numericColumns(table)
  const cell = cn('border-b border-border px-2 py-1.5', large ? 'text-base' : 'text-sm')
  return (
    <div
      className="overflow-x-auto rounded-md border border-border focus-visible:outline-2 focus-visible:outline-ring"
      tabIndex={0}
      role="region"
      aria-label={table.title ?? TABLE_UNTITLED}
    >
      <table className="w-full border-collapse">
        {table.title && <caption className="px-2 py-1.5 text-left text-sm font-bold">{table.title}</caption>}
        <thead className="bg-muted">
          <tr>
            {table.columns.map((c, i) => (
              <th
                key={`${c}-${String(i)}`}
                scope="col"
                className={cn(cell, 'font-bold whitespace-nowrap', numeric[i] ? 'text-right' : 'text-left')}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {table.columns.map((_, i) => (
                <td key={i} className={cn(cell, numeric[i] ? 'text-right tabular-nums' : 'text-left')}>
                  {row[i] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Una tabla de la respuesta con sus acciones: ampliar, Excel y preguntas rápidas. */
export function AssistantTable({
  table,
  index,
  messageId,
  busy,
  onAsk,
}: {
  table: TableBlock
  index: number
  /** Sin id (respuesta aún no guardada) no hay Excel. */
  messageId?: string
  busy: boolean
  onAsk: (question: string) => void
}) {
  const [zoom, setZoom] = useState(false)
  const download = useDownloadTable()
  const title = table.title ?? TABLE_UNTITLED

  const save = () => {
    if (!messageId) return
    download.mutate({ messageId, index, title: table.title }, { onError: () => toast.error(TABLE_DOWNLOAD_FAILED) })
  }

  return (
    <div className="grid gap-2">
      <TableGrid table={table} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => setZoom(true)}
          className="focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Maximize2 aria-hidden /> {TABLE_EXPAND}
        </Button>
        {messageId && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={save}
            disabled={download.isPending}
            className="focus-visible:outline-2 focus-visible:outline-ring"
          >
            {download.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Download aria-hidden />}{' '}
            {download.isPending ? TABLE_DOWNLOADING : TABLE_DOWNLOAD}
          </Button>
        )}
      </div>
      <div role="group" aria-label={TABLE_ASK_GROUP} className="flex flex-wrap gap-2">
        {tableQuestions(table.title).map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => onAsk(q)}
            className="min-h-8 rounded-full border border-border bg-surface px-3 py-1 text-left text-xs text-ink-2 transition-colors hover:border-primary hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 hc:border-foreground hc:text-foreground"
          >
            {q}
          </button>
        ))}
      </div>
      {/* Radix cierra con Esc y devuelve el foco al botón que lo abrió. */}
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{TABLE_DIALOG_DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <TableGrid table={{ ...table, title: null }} large />
        </DialogContent>
      </Dialog>
    </div>
  )
}
