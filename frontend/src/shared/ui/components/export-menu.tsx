import { useState } from 'react'
import { ChevronDown, Download, FileSpreadsheet, FileText, FileType2, Loader2 } from 'lucide-react'
import { EXPORT_FORMATS, type ExportFormat } from '@/shared/domain/export'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/components/shadcn/dropdown-menu'

const ICON: Record<ExportFormat, typeof FileText> = { xlsx: FileSpreadsheet, pdf: FileType2, csv: FileText }

/** Botón "Exportar" con menú de formatos. `compact`: solo ícono (encabezado en celular). */
export function ExportMenu({
  onExport,
  disabled,
  compact,
  className,
}: {
  onExport: (format: ExportFormat) => Promise<void>
  disabled?: boolean
  compact?: boolean
  className?: string
}) {
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const run = async (format: ExportFormat) => {
    setBusy(format)
    try {
      await onExport(format)
    } finally {
      setBusy(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={(disabled ?? false) || busy !== null}>
        {compact ? (
          <Button variant="ghost" size="icon" aria-label="Exportar" className={className}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
          </Button>
        ) : (
          <Button variant="outline" className={className}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />} Exportar
            <ChevronDown className="text-muted-foreground" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Exportar como</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {EXPORT_FORMATS.map(({ format, label, hint }) => {
          const Icon = ICON[format]
          return (
            <DropdownMenuItem key={format} onSelect={() => void run(format)} className="gap-3 py-2">
              <Icon className="size-4.5 text-muted-foreground" />
              <span className="grid">
                <b className="text-base font-medium">{label}</b>
                <small className="text-xs text-muted-foreground">{hint}</small>
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
