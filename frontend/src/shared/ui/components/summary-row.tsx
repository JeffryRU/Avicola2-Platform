import type { ReactNode } from 'react'

/** Fila de un resumen: ícono, etiqueta y valor alineado a la derecha (confirmación, conexión). */
export function SummaryRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.25rem_auto_minmax(0,1fr)] items-center gap-3 border-b border-rule py-3 last:border-0 [&>svg]:size-4 [&>svg]:text-muted-foreground">
      {icon}
      <span className="text-ink-2">{label}</span>
      <b className="min-w-0 text-right font-semibold [overflow-wrap:anywhere] [&_small]:block [&_small]:font-normal [&_small]:text-muted-foreground">
        {children}
      </b>
    </div>
  )
}
