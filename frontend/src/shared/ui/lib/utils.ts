import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * twMerge con las utilidades propias del sistema (globals.css): sin esto, `border-control`
 * se tomaría por un color de borde y `h-touch` no reemplazaría a otra altura.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      h: ['h-touch', 'h-control'],
      'min-h': ['min-h-touch'],
      size: ['size-touch', 'size-control'],
      'border-w': ['border-control'],
      'border-w-t': ['border-t-heavy'],
      'border-w-b': ['border-b-heavy'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
