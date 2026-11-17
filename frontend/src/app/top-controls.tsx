import { VersionsButton } from '@/features/versions'
import { AccentPicker } from '@/shared/ui/components/accent-picker'
import { AccessibilityMenu } from '@/shared/ui/components/accessibility-menu'
import { ThemeToggle } from '@/shared/ui/components/theme-toggle'
import type { ReactNode } from 'react'
import { cn } from '@/shared/ui/lib/utils'

/**
 * Versiones, color principal, accesibilidad y sol/luna. Van arriba a la derecha en el login y en
 * la barra del celular; en escritorio, al pie del menú lateral (fuera de las pantallas).
 */
export function TopControls({
  className,
  side,
  children,
}: {
  className?: string
  side?: 'bottom' | 'top'
  /** Botones extra al final (p. ej. el engranaje de Perfil en el menú lateral). */
  children?: ReactNode
}) {
  return (
    <div className={cn('flex flex-none items-center gap-0.5', className)}>
      <VersionsButton />
      <AccentPicker side={side} />
      <AccessibilityMenu side={side} />
      <ThemeToggle />
      {children}
    </div>
  )
}
