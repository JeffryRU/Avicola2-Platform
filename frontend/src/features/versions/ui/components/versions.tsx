import { useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { useContainer } from '@/app/di'
import { Layers } from 'lucide-react'
import { PanelContext, useCurrentVersion, useOpenVersions } from '@/features/versions/ui/hooks'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/components/shadcn/dialog'
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
      className={cn(
        'flex w-full items-center justify-center gap-2 px-4 py-1.5 text-[13px] font-semibold text-white',
        toneOf(catalog, version),
      )}
    >
      <Layers className="size-4" />
      <span>
        Estás viendo <b className="font-extrabold">{version.name}</b> · versión {number}
      </span>
      <span className="ml-1 hidden underline underline-offset-2 sm:inline">Ver otras versiones</span>
    </button>
  )
}

/** Aviso grande al abrir el enlace de una versión (una vez por sesión). */
function VersionSplash({ open, onClose, onMore }: { open: boolean; onClose: () => void; onMore: () => void }) {
  const { catalog, version, number } = useCurrentVersion()
  if (!version) return null
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-md">
        <div className={cn('px-6 pt-7 pb-6 text-white', toneOf(catalog, version))}>
          <p className="text-[13px] font-bold tracking-[0.08em] uppercase opacity-80">Esta es la versión</p>
          <DialogTitle className="mt-1 text-[44px] leading-none font-extrabold">{version.name}</DialogTitle>
          <p className="mt-2 text-lg font-semibold">
            v{number} · {longDate(version.date)}
          </p>
        </div>
        <div className="grid gap-4 px-6 pb-6">
          <DialogDescription className="text-[15px] text-ink-2">{version.summary}</DialogDescription>
          <Highlights items={version.highlights} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-xl bg-primary px-4 font-bold text-primary-foreground"
            >
              Continuar
            </button>
            <button type="button" onClick={onMore} className="h-11 flex-1 rounded-xl border px-4 font-bold">
              Ver otras versiones
            </button>
          </div>
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
        'flex w-full items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left hover:bg-secondary',
        className,
      )}
    >
      <span className={cn('grid size-8 flex-none place-items-center rounded-lg text-white', toneOf(catalog, version))}>
        <Layers className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-sm">{version.name}</b>
        <small className="text-muted-foreground">versión {number} · cambiar</small>
      </span>
    </button>
  )
}
