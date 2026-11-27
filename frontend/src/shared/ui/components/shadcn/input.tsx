import * as React from 'react'
import { cn } from '@/shared/ui/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-touch w-full min-w-0 rounded-md border-control border-input bg-surface px-3 py-1 text-md text-foreground transition-colors outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dsk:h-control dsk:text-base',
        'focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
        'aria-invalid:border-bad',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
