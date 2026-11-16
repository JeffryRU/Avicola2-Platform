import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/ui/lib/utils'
import { Slot } from 'radix-ui'

/**
 * Botones del sistema (docs/diseno/sistema.md). Alto táctil de 44 px en celular (48 en alto
 * contraste) y 36 px en escritorio. El color de la marca solo en la acción principal.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-base font-medium whitespace-nowrap transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-bad hc:font-bold [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        destructive: 'bg-bad text-bad-foreground hover:opacity-90',
        outline: 'border-control border-border-strong bg-surface text-foreground hover:bg-muted',
        secondary: 'bg-selected text-selected-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-touch px-4 dsk:h-control has-[>svg]:px-3.5',
        xs: 'h-8 gap-1 px-2 text-xs [&_svg:not([class*=size-])]:size-3',
        sm: 'h-touch gap-1.5 px-3 text-sm dsk:h-8 has-[>svg]:px-2.5',
        lg: 'h-12 px-6 text-md',
        icon: 'size-touch dsk:size-control',
        'icon-xs': 'size-8 [&_svg:not([class*=size-])]:size-3.5',
        'icon-sm': 'size-touch dsk:size-8',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
