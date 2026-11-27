import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, ServerCog } from 'lucide-react'
import { registerSW } from 'virtual:pwa-register'
import { z } from 'zod'
import { useContainer } from '@/app/di'
import {
  INITIAL_UPDATE,
  RELOAD_AFTER_S,
  delayFor,
  nextUpdate,
  readCheck,
  type UpdateState,
} from '@/shared/domain/app-update'
import { Button } from '@/shared/ui/components/shadcn/button'

/** Identificador de este build (lo escribe vite.config.ts también en /version.json). */
const BUILD = __APP_BUILD__
const VERSION_URL = '/version.json'
/** Si el service worker nuevo no toma el control en este tiempo, se recarga igual (ms). */
const SW_TIMEOUT_MS = 8_000
/** Para no recargar en bucle si un archivo falta de verdad (ms). */
const PRELOAD_GUARD_KEY = 'nv_preload_reload'
const PRELOAD_GUARD_MS = 30_000

/**
 * Recarga «de verdad»: quita el service worker y lo que guardó en caché, y vuelve a pedir la
 * página al servidor. Así nunca queda una versión vieja a medias (archivos que ya no existen,
 * una API que cambió).
 */
async function hardReload() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
    const keys = 'caches' in window ? await caches.keys() : []
    // La copia del catálogo (api-master-data) se queda: sirve sin conexión y se revalida sola.
    await Promise.all(keys.filter((k) => k !== 'api-master-data').map((k) => caches.delete(k)))
  } finally {
    window.location.reload()
  }
}

async function checkVersion() {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store', headers: { accept: 'application/json' } })
    const body: unknown = res.ok ? await res.json().catch(() => null) : null
    return readCheck(res.status, body)
  } catch {
    return readCheck(null, null)
  }
}

/**
 * Vigila si hay una versión nueva o si el servidor se está reiniciando (un despliegue). Avisa y,
 * con la versión nueva, recarga sola la página en unos segundos (sin dejar nada viejo en caché).
 */
export function UpdateWatcher() {
  const { session } = useContainer()
  const [state, setState] = useState<UpdateState>(INITIAL_UPDATE)
  const [left, setLeft] = useState(RELOAD_AFTER_S)
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const reloading = useRef(false)
  // El estado también en una ref: la consulta periódica lo lee sin volver a montarse.
  const current = useRef<UpdateState>(INITIAL_UPDATE)

  const reload = useCallback(() => {
    if (reloading.current) return
    reloading.current = true
    const reg = registration.current
    if (!reg) {
      void hardReload()
      return
    }
    // Primero se pide el service worker nuevo (toma el control y recarga); si tarda, a la fuerza.
    window.setTimeout(() => void hardReload(), SW_TIMEOUT_MS)
    reg.update().catch(() => void hardReload())
  }, [])

  // Service worker: se registra aquí para avisar antes de recargar cuando hay uno nuevo.
  useEffect(() => {
    if (!import.meta.env.PROD) return
    registerSW({
      immediate: true,
      onNeedReload: () => window.location.reload(),
      onRegisteredSW: (_url, reg) => {
        registration.current = reg
      },
    })
  }, [])

  // Consulta de la versión: cada minuto, al volver a la pestaña y seguido mientras está caído.
  useEffect(() => {
    if (!import.meta.env.PROD) return
    let timer = 0
    let alive = true
    const tick = async () => {
      const check = await checkVersion()
      if (!alive) return
      const next = nextUpdate(current.current, check, BUILD)
      current.current = next
      setState(next)
      window.clearTimeout(timer)
      if (next.phase !== 'updating') timer = window.setTimeout(() => void tick(), delayFor(next))
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    timer = window.setTimeout(() => void tick(), delayFor(INITIAL_UPDATE))
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      alive = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [])

  // Un archivo de la versión anterior que ya no existe (otra pestaña quedó vieja): recargar.
  useEffect(() => {
    const onPreloadError = (event: Event) => {
      const last = session.get(PRELOAD_GUARD_KEY, z.number()) ?? 0
      if (Date.now() - last < PRELOAD_GUARD_MS) return
      event.preventDefault()
      session.set(PRELOAD_GUARD_KEY, Date.now())
      current.current = { phase: 'updating', failures: 0 }
      setState(current.current)
    }
    window.addEventListener('vite:preloadError', onPreloadError)
    return () => window.removeEventListener('vite:preloadError', onPreloadError)
  }, [session])

  // Versión nueva: cuenta regresiva y recarga.
  useEffect(() => {
    if (state.phase !== 'updating') return
    if (left <= 0) {
      reload()
      return
    }
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [state.phase, left, reload])

  if (state.phase === 'idle') return null
  const updating = state.phase === 'updating'
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border border-border bg-surface p-4 text-foreground shadow-lg"
      >
        <span className="grid size-9 flex-none place-items-center rounded-full bg-primary/10 text-primary">
          {updating ? (
            <RefreshCw aria-hidden className="size-5 motion-safe:animate-spin" />
          ) : (
            <ServerCog aria-hidden className="size-5 motion-safe:animate-pulse" />
          )}
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <b className="text-sm font-semibold">
            {updating ? 'Actualizando AviPlanner' : 'El sistema se está reiniciando'}
          </b>
          <p className="text-sm text-muted-foreground">
            {updating
              ? `Hay una versión nueva. La página se recargará sola en ${String(Math.max(left, 0))} s.`
              : 'Se está aplicando un cambio. Se reconecta solo en unos segundos; no cierres esta página.'}
          </p>
          {updating && (
            <div>
              <Button type="button" size="sm" onClick={reload} className="mt-1">
                Recargar ahora
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
