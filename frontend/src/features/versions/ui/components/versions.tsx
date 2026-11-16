import { useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { useContainer } from '@/app/di'
import { PanelContext, useCurrentVersion, useOpenVersions } from '@/features/versions/ui/hooks'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/components/shadcn/dialog'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'
import { Highlights } from '@/features/versions/ui/components/version-panel'
import { VersionPanel } from '@/features/versions/ui/components/version-panel'
import { toneOf, longDate } from '@/features/versions/ui/components/version-style'

/*
 * Selector de versiones (MVP 1, MVP 2…): una franja arriba dice qué versión se está viendo, al
 * abrir el enlace aparece un aviso grande y el panel permite cambiar de versión, ver sus
 * novedades y comparar dos. Cada versión se abre en su propio despliegue, con su backend.
 */

const SPLASH_KEY = 'nv_version_splash'
/** El aviso grande vuelve a salir si pasaron unas horas desde la última vez (otra demo). */
const SPLASH_EVERY_MS = 6 * 60 * 60_000
const splashSchema = z.object({ id: z.string(), at: z.number() })

/** Envuelve la app: franja de versión arriba, aviso grande al abrir y el panel. */
export function VersionProvider({ children }: { children: ReactNode }) {
  const { preferences } = useContainer()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  // Hora en que se abrió la app (no se recalcula en cada render).
  const [openedAt] = useState(() => Date.now())
  const current = useCurrentVersion()
  const id = current.version?.id ?? null
  const seen = preferences.get(SPLASH_KEY, splashSchema)
  const recently = !!seen && seen.id === id && openedAt - seen.at < SPLASH_EVERY_MS
  const splash = !!id && dismissed !== id && !recently
  const closeSplash = () => {
    if (!id) return
    setDismissed(id)
    preferences.set(SPLASH_KEY, { id, at: Date.now() })
  }
  const openPanel = useMemo(() => () => setOpen(true), [])
  return (
    <PanelContext.Provider value={openPanel}>
      <VersionRibbon onOpen={openPanel} />
      {children}
      {current.version && (
        <VersionSplash
          open={splash}
          onClose={closeSplash}
          onMore={() => {
            closeSplash()
            setOpen(true)
          }}
        />
      )}
      <VersionPanel open={open} onOpenChange={setOpen} />
    </PanelContext.Provider>
  )
}

/** Franja de arriba: qué versión es esta. */
function VersionRibbon({ onOpen }: { onOpen: () => void }) {
  const { catalog, version, number } = useCurrentVersion()
  if (!version) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-8 w-full items-center justify-center gap-2 border-b border-border bg-muted px-4 py-1 text-xs text-ink-2 hover:text-foreground hc:border-b-2 hc:border-foreground hc:text-sm"
    >
      <span aria-hidden className={cn('size-2 flex-none rounded-full', toneOf(catalog, version))} />
      <span>
        Estás viendo <b className="font-semibold text-foreground">{version.name}</b> · versión {number}
      </span>
      <span className="ml-1 hidden text-primary underline underline-offset-2 sm:inline">Ver otras versiones</span>
    </button>
  )
}

/** Aviso grande al abrir el enlace de una versión (una vez por sesión). */
function VersionSplash({ open, onClose, onMore }: { open: boolean; onClose: () => void; onMore: () => void }) {
  const { catalog, version, number } = useCurrentVersion()
  if (!version) return null
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-start gap-3">
          <span aria-hidden className={cn('mt-2 size-2.5 flex-none rounded-full', toneOf(catalog, version))} />
          <div>
            <p className="eyebrow">Esta es la versión</p>
            <DialogTitle className="text-3xl font-semibold hc:font-extrabold">{version.name}</DialogTitle>
            <p className="num text-sm text-muted-foreground">
              v{number} · {longDate(version.date)}
            </p>
          </div>
        </div>
        <DialogDescription className="text-md text-ink-2">{version.summary}</DialogDescription>
        <Highlights items={version.highlights} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onClose} className="flex-1">
            Continuar
          </Button>
          <Button type="button" variant="outline" onClick={onMore} className="flex-1">
            Ver otras versiones
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Chip para el menú lateral y el perfil: abre el panel. */
export function VersionChip({ className }: { className?: string }) {
  const { catalog, version, number } = useCurrentVersion()
  const open = useOpenVersions()
  if (!version) return null
  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        'flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-sm text-ink-2 hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      <span aria-hidden className={cn('size-2 flex-none rounded-full', toneOf(catalog, version))} />
      <span className="min-w-0 flex-1">
        <b className="font-medium text-foreground">{version.name}</b> · v{number}
      </span>
      <span className="text-xs text-primary">Cambiar</span>
    </button>
  )
}
