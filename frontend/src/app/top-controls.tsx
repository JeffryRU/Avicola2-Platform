import { VersionsButton } from '@/features/versions'
import { LookButton } from '@/shared/ui/components/look-panel'
import { AccessibilityMenu } from '@/shared/ui/components/accessibility-menu'
import { ThemeToggle } from '@/shared/ui/components/theme-toggle'
import type { ReactNode } from 'react'
import { cn } from '@/shared/ui/lib/utils'

/**
 * Versiones, apariencia, accesibilidad y sol/luna. En el login van arriba a la derecha; en la
 * app, apariencia y sol/luna van en la barra de arriba (la accesibilidad, en el botón «+»).
 */
export function TopControls({
  className,
  side,
  versions = true,
  a11y = true,
  children,
}: {
  className?: string
  side?: 'bottom' | 'top'
  /** Botón de versiones (en la app va en Perfil → Opciones; aquí solo en el login). */
  versions?: boolean
  /** Botón de accesibilidad (en la app va en el botón «+» de abajo a la derecha). */
  a11y?: boolean
  /** Botones extra al final (p. ej. el engranaje de Perfil en el menú lateral). */
  children?: ReactNode
}) {
  return (
    <div className={cn('flex flex-none items-center gap-0.5', className)}>
      {versions && <VersionsButton />}
      <LookButton />
      {a11y && <AccessibilityMenu side={side} />}
      <ThemeToggle />
      {children}
    </div>
  )
}
