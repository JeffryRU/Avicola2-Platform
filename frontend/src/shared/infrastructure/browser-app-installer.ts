import type { AppInstaller, DevicePlatform, InstallState } from '@/shared/application/ports'

/** Evento no estándar de Chromium que permite mostrar el diálogo de instalación cuando se quiera. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isIos = (nav: Navigator) =>
  /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.userAgent.includes('Macintosh') && nav.maxTouchPoints > 1)

const isAndroid = (nav: Navigator) => /Android/i.test(nav.userAgent)

/**
 * La app de Android se publica en GitHub Releases (sin Play Store). Este enlace siempre apunta al
 * APK de la última versión: no hay que tocar la web en cada versión.
 */
export const DEFAULT_ANDROID_APK_URL =
  'https://github.com/JeffryRU/Avicola2-Platform/releases/latest/download/noraves.apk'

/**
 * Escucha `beforeinstallprompt` desde que abre la app (puede llegar antes del login) y lo guarda
 * para usarlo cuando la persona toque "Instalar".
 */
export class BrowserAppInstaller implements AppInstaller {
  private deferred: BeforeInstallPromptEvent | null = null
  private installedNow = false
  private readonly listeners = new Set<() => void>()
  private readonly win: Window
  private readonly apkUrl: string | null

  constructor(win: Window = window, apkUrl: string | null = DEFAULT_ANDROID_APK_URL) {
    this.win = win
    this.apkUrl = apkUrl === '' ? null : apkUrl // vacío = sin app nativa
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

  platform = (): DevicePlatform => {
    if (isAndroid(this.win.navigator)) return 'android'
    if (isIos(this.win.navigator)) return 'ios'
    return 'other'
  }

  nativeAppUrl = () => (this.platform() === 'android' ? this.apkUrl : null)

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
