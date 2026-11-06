import { useState, useSyncExternalStore } from 'react'
import { Download, Globe, PlusSquare, Share, Smartphone, X } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useContainer } from '@/app/di'
import type { InstallState } from '@/shared/application/ports'
import { BRANDS, BrandMark, useBrand } from '@/shared/ui/components/brand'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog'

const SNOOZE_KEY = 'nv_install_snooze_until'
const SNOOZE_DAYS = 14

function useInstallState(): InstallState {
  const { installer } = useContainer()
  return useSyncExternalStore(
    (cb) => installer.subscribe(cb),
    () => installer.state(),
  )
}

/**
 * "Instalar":
 * - Android: elegir entre la app nativa (APK de GitHub Releases) y la app web (PWA).
 * - iPhone: instrucciones de Safari (la app de iOS necesita cuenta de Apple de pago).
 * - PC: diálogo del navegador.
 */
function useInstallAction() {
  const { installer } = useContainer()
  const state = useInstallState()
  const apkUrl = installer.nativeAppUrl()
  const [iosHelp, setIosHelp] = useState(false)
  const [chooser, setChooser] = useState(false)
  const installWeb = async () => {
    setChooser(false)
    if (await installer.install()) toast.success('¡Listo! La app quedó instalada en tu dispositivo.')
  }
  const install = async () => {
    if (apkUrl) setChooser(true)
    else if (state === 'ios') setIosHelp(true)
    else await installWeb()
  }
  const dialog = (
    <>
      <IosInstallDialog open={iosHelp} onOpenChange={setIosHelp} />
      {apkUrl && (
        <AndroidInstallDialog
          open={chooser}
          onOpenChange={setChooser}
          apkUrl={apkUrl}
          webAvailable={state === 'available'}
          onInstallWeb={installWeb}
        />
      )}
    </>
  )
  /** Hay algo que ofrecer: la app nativa (Android) o la app web aún no instalada. */
  const offerable = Boolean(apkUrl) || state === 'available' || state === 'ios'
  return { state, install, dialog, offerable }
}

function AndroidInstallDialog({
  open,
  onOpenChange,
  apkUrl,
  webAvailable,
  onInstallWeb,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  apkUrl: string
  webAvailable: boolean
  onInstallWeb: () => void
}) {
  const { brand } = useBrand()
  const optionCls = 'flex w-full items-start gap-3 rounded-2xl border bg-card p-3.5 text-left hover:bg-secondary/60'
  const iconCls = 'grid size-10 flex-none place-items-center rounded-xl bg-secondary text-primary [&>svg]:size-5'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Instalar {BRANDS[brand].name}</DialogTitle>
          <DialogDescription>Elige cómo quieres usarla en tu celular:</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2.5">
          <a href={apkUrl} className={optionCls} onClick={() => onOpenChange(false)} rel="noopener">
            <span className={iconCls}>
              <Smartphone />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block">App de Android</b>
              <small className="text-muted-foreground">
                Descarga la última versión. Al abrir el archivo, Android te pedirá permitir instalar apps de esta
                fuente.
              </small>
            </span>
          </a>
          {webAvailable && (
            <button type="button" className={optionCls} onClick={onInstallWeb}>
              <span className={iconCls}>
                <Globe />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block">App web</b>
                <small className="text-muted-foreground">Se instala desde el navegador y ocupa muy poco espacio.</small>
              </span>
            </button>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Ahora no
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IosInstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { brand } = useBrand()
  const steps = [
    { icon: Share, text: 'Toca el botón Compartir (el cuadrado con la flecha hacia arriba).' },
    { icon: PlusSquare, text: 'Elige "Agregar a inicio" (o "Agregar a pantalla de inicio").' },
    { icon: Smartphone, text: `Toca "Agregar". ${BRANDS[brand].name} aparecerá con los demás apps.` },
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Instalar en iPhone o iPad</DialogTitle>
          <DialogDescription>En Safari se instala en tres pasos:</DialogDescription>
        </DialogHeader>
        <ol className="grid gap-3">
          {steps.map(({ icon: Icon, text }, i) => (
            <li key={text} className="flex items-start gap-3">
              <span className="grid size-9 flex-none place-items-center rounded-xl bg-secondary text-primary">
                <Icon className="size-[18px]" />
              </span>
              <span className="pt-1.5 text-sm">
                <b>{i + 1}.</b> {text}
              </span>
            </li>
          ))}
        </ol>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const snoozeSchema = z.number()

/**
 * Aviso para instalar la app (solo celular). No aparece si ya está instalada o si el navegador
 * no lo permite; "Ahora no" lo oculta por 14 días.
 */
export function InstallBanner() {
  const { preferences } = useContainer()
  const { brand } = useBrand()
  const { state, install, dialog, offerable } = useInstallAction()
  const [snoozed, setSnoozed] = useState(() => (preferences.get(SNOOZE_KEY, snoozeSchema) ?? 0) > Date.now())

  if (state === 'installed' || !offerable || snoozed) return dialog
  const later = () => {
    preferences.set(SNOOZE_KEY, Date.now() + SNOOZE_DAYS * 86_400_000)
    setSnoozed(true)
  }

  return (
    <>
      <aside
        aria-label="Instalar la app"
        className="fixed inset-x-3 bottom-[calc(80px+env(safe-area-inset-bottom))] z-30 flex animate-rise items-center gap-3 rounded-2xl border bg-card p-3.5 pr-10 shadow-sheet dsk:hidden"
      >
        <BrandMark size={44} />
        <div className="min-w-0 flex-1">
          <b className="block text-[15px]">Instala {BRANDS[brand].name} en tu celular</b>
          <small className="text-ink-2">Más rápida y funciona sin señal.</small>
        </div>
        <Button type="button" size="sm" onClick={install} className="flex-none">
          <Download /> Instalar
        </Button>
        <button
          type="button"
          onClick={later}
          aria-label="Ahora no"
          className="absolute top-2 right-2 grid size-7 place-items-center rounded-lg text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      </aside>
      {dialog}
    </>
  )
}

/**
 * Opción en Perfil (también en escritorio). Solo si hay algo que instalar: la app web aún no
 * instalada o, en Android, la app nativa (también desde la app web ya instalada).
 */
export function InstallOption({ className }: { className: string }) {
  const { install, dialog, offerable } = useInstallAction()
  if (!offerable) return dialog
  return (
    <>
      <button type="button" className={className} onClick={install}>
        <span className="grid size-10 flex-none place-items-center rounded-xl bg-secondary text-primary [&>svg]:size-5">
          <Download />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block">Instalar la app</b>
          <small className="text-muted-foreground">Ábrela desde tu pantalla de inicio, como cualquier app</small>
        </span>
      </button>
      {dialog}
    </>
  )
}
