import type { LogSink } from '@/core/application/ports'
import { clientLogEntrySchema, describeError, type ClientLogEntry, type ClientLogLevel } from '@/core/domain/client-log'

interface Options {
  /** Pantalla actual y vendedor con sesión (si hay), leídos en el momento del error. */
  context: () => { route: string; user?: string }
  version?: string
  now?: () => Date
  /** Programa el envío diferido (setTimeout en el navegador). */
  schedule?: (fn: () => void, ms: number) => void
  flushDelayMs?: number
  /** Un mismo error en la misma pantalla se reporta como máximo una vez en este lapso. */
  dedupeMs?: number
  maxBuffer?: number
}

const BATCH = 20

/** Junta los errores del navegador y los envía al backend en lotes, sin repetir ni saturar. */
export class ErrorReporter {
  private readonly sink: LogSink
  private readonly options: Required<Omit<Options, 'version'>> & Pick<Options, 'version'>
  private buffer: ClientLogEntry[] = []
  private readonly lastSeen = new Map<string, number>()
  private scheduled = false
  private sending = false

  constructor(sink: LogSink, options: Options) {
    this.sink = sink
    this.options = {
      now: () => new Date(),
      schedule: (fn, ms) => void setTimeout(fn, ms),
      flushDelayMs: 2000,
      dedupeMs: 60_000,
      maxBuffer: 50,
      ...options,
    }
  }

  report(error: unknown, kind = 'error', level: ClientLogLevel = 'error') {
    try {
      const { context, version, now, dedupeMs, maxBuffer } = this.options
      const { route, user } = context()
      const { message, stack } = describeError(error)
      const at = now()
      const key = `${kind}|${route}|${message}`
      const last = this.lastSeen.get(key)
      if (last !== undefined && at.getTime() - last < dedupeMs) return
      this.lastSeen.set(key, at.getTime())
      const entry = clientLogEntrySchema.safeParse({
        level,
        kind,
        message,
        stack,
        route: route.slice(0, 300),
        user,
        app_version: version,
        at: at.toISOString(),
      })
      if (!entry.success || this.buffer.length >= maxBuffer) return
      this.buffer.push(entry.data)
      this.scheduleFlush()
    } catch {
      // Reportar un error nunca puede romper la app.
    }
  }

  /** Envía lo pendiente; si no hay red, lo conserva para el siguiente intento. */
  async flush() {
    if (this.sending || !this.buffer.length) return
    this.sending = true
    try {
      while (this.buffer.length) {
        const batch = this.buffer.slice(0, BATCH)
        await this.sink.send(batch)
        this.buffer = this.buffer.slice(batch.length)
      }
    } catch {
      // Sin conexión o backend caído: se reintenta con el próximo error o al volver la red.
    } finally {
      this.sending = false
    }
  }

  /** Al cerrar o esconder la página: último envío, sin esperar respuesta. */
  flushOnExit() {
    if (this.buffer.length && this.sink.sendOnExit(this.buffer.slice(0, BATCH))) {
      this.buffer = this.buffer.slice(BATCH)
    }
  }

  pending = () => this.buffer.length

  private scheduleFlush() {
    if (this.scheduled) return
    this.scheduled = true
    this.options.schedule(() => {
      this.scheduled = false
      void this.flush()
    }, this.options.flushDelayMs)
  }
}
