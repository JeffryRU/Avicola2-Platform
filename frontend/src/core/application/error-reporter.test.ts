import { describe, expect, it } from 'vitest'
import { ErrorReporter } from '@/core/application/error-reporter'
import type { LogSink } from '@/core/application/ports'
import type { ClientLogEntry } from '@/core/domain/client-log'

class FakeSink implements LogSink {
  sent: ClientLogEntry[][] = []
  exits: ClientLogEntry[][] = []
  online = true
  async send(entries: ClientLogEntry[]) {
    if (!this.online) throw new Error('sin red')
    this.sent.push(entries)
  }
  sendOnExit(entries: ClientLogEntry[]) {
    this.exits.push(entries)
    return true
  }
}

function setup(user?: string) {
  const sink = new FakeSink()
  let clock = Date.parse('2026-11-02T08:00:00Z')
  const scheduled: (() => void)[] = []
  const reporter = new ErrorReporter(sink, {
    context: () => ({ route: '/registrar', user }),
    version: '1.0.0',
    now: () => new Date(clock),
    schedule: (fn) => scheduled.push(fn),
  })
  const advance = (ms: number) => (clock += ms)
  return { sink, reporter, scheduled, advance }
}

describe('reportero de errores', () => {
  it('envía el error con pantalla, vendedor y versión, en un solo envío diferido', async () => {
    const { sink, reporter, scheduled } = setup('jperez')
    reporter.report(new TypeError('units is undefined'), 'react')
    reporter.report('otro problema')
    expect(scheduled).toHaveLength(1)
    await reporter.flush()
    expect(sink.sent).toHaveLength(1)
    expect(sink.sent[0][0]).toMatchObject({
      level: 'error',
      kind: 'react',
      message: 'TypeError: units is undefined',
      route: '/registrar',
      user: 'jperez',
      app_version: '1.0.0',
      at: '2026-11-02T08:00:00.000Z',
    })
    expect(sink.sent[0][0].stack).toContain('TypeError')
    expect(sink.sent[0][1].message).toBe('otro problema')
  })

  it('no repite el mismo error en un minuto', async () => {
    const { sink, reporter, advance } = setup()
    reporter.report(new Error('x'))
    advance(30_000)
    reporter.report(new Error('x'))
    advance(31_000)
    reporter.report(new Error('x'))
    await reporter.flush()
    expect(sink.sent.flat()).toHaveLength(2)
  })

  it('sin conexión conserva los reportes y los manda después', async () => {
    const { sink, reporter } = setup()
    sink.online = false
    reporter.report(new Error('a'))
    await reporter.flush()
    expect(reporter.pending()).toBe(1)
    sink.online = true
    await reporter.flush()
    expect(reporter.pending()).toBe(0)
    expect(sink.sent.flat().map((e) => e.message)).toEqual(['Error: a'])
  })

  it('al cerrar la página manda lo pendiente', () => {
    const { sink, reporter } = setup()
    reporter.report(new Error('al salir'))
    reporter.flushOnExit()
    expect(sink.exits.flat()).toHaveLength(1)
    expect(reporter.pending()).toBe(0)
  })

  it('acota el buffer y nunca lanza aunque el error sea raro', () => {
    const { reporter, advance } = setup('usuario con espacios')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => reporter.report(circular)).not.toThrow()
    for (let i = 0; i < 80; i++) {
      advance(1)
      reporter.report(new Error(`e${i}`))
    }
    expect(reporter.pending()).toBeLessThanOrEqual(50)
  })
})
