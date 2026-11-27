import { useState, type ReactNode } from 'react'

/** Tooltip que sigue al mouse (gráficos y tarjetas del mockup). */
export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null)
  const bind = (content: ReactNode) => ({
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseLeave: () => setTip(null),
  })
  const node = tip && (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-[calc(100%+0.75rem)] rounded-md border border-border bg-popover px-3 py-2 text-sm leading-snug whitespace-nowrap text-popover-foreground shadow-pop [&_b]:font-semibold"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.content}
    </div>
  )
  return { bind, node }
}
