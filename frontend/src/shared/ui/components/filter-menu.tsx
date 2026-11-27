import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/ui/components/shadcn/dropdown-menu'
import { cn } from '@/shared/ui/lib/utils'

/** Un filtro de la barra: botón con el valor actual que abre su menú. `active` = distinto del valor por defecto. */
export function FilterMenu({
  icon,
  label,
  title,
  active = false,
  children,
}: {
  icon?: ReactNode
  label: string
  title: string
  active?: boolean
  children: ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${title}: ${label}`}
        className={cn(
          'flex h-touch flex-none items-center gap-1.5 rounded-md border-control border-border-strong bg-surface px-3 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-muted dsk:h-control [&_svg]:size-4',
          active &&
            'border-primary bg-selected font-medium text-selected-foreground hover:bg-selected hc:border-foreground',
        )}
      >
        {icon && (
          <span className={cn('grid', active ? 'text-selected-foreground' : 'text-muted-foreground')}>{icon}</span>
        )}
        {label}
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(70dvh,26rem)] min-w-56 overflow-y-auto">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
