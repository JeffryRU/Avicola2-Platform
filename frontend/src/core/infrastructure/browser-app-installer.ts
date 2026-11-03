import type { AppInstaller, InstallState } from '@/core/application/ports'

/** Evento no estándar de Chromium que permite mostrar el diálogo de instalación cuando se quiera. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isIos = (nav: Navigator) =>
  /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1)

/**
 * Escucha `beforeinstallprompt` desde que abre la app (puede llegar antes del login) y lo guarda
 * para usarlo cuando la persona toque "Instalar".
 */
export class BrowserAppInstaller implements AppInstaller {
  private deferred: BeforeInstallPromptEvent | null = null
  private installedNow = false
  private readonly listeners = new Set<() => void>()
  private readonly win: Window

  constructor(win: Window = window) {
    this.win = win
    win.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault() // sin el mini aviso del navegador: se muestra el de la app
      this.deferred = e as BeforeInstallPromptEvent
      this.emit()
    })
    win.addEventListener('appinstalled', () => {
      this.deferred = null
      this.installedNow = true
      this.emit()
    })
    win.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => this.emit())
  }

  state = (): InstallState => {
    const standalone =
      this.win.matchMedia?.('(display-mode: standalone)').matches ||
      (this.win.navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone || this.installedNow) return 'installed'
    if (this.deferred) return 'available'
    if (isIos(this.win.navigator)) return 'ios'
    return 'unavailable'
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  install = async () => {
    const event = this.deferred
    if (!event) return false
    await event.prompt()
    const { outcome } = await event.userChoice
    this.deferred = null // el evento sirve una sola vez
    this.emit()
    return outcome === 'accepted'
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }
}
