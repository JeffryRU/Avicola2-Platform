import { describe, expect, it } from 'vitest'
import { ARIS_MAX_BYTES, arisStatusSchema, needsUpload, tooBig, type ArisStatus } from '@/features/aris/domain/aris'
import { arisLoadSummary, arisNoticeText } from '@/features/aris/types/aris'

const status = (over: Partial<ArisStatus> = {}): ArisStatus => ({
  last_dispatch: '2026-11-15',
  last_sales: '2026-11-15',
  missing_days: 1,
  level: 'info',
  training_pending: false,
  ...over,
})

describe('datos de ARIS', () => {
  it('solo avisa cuando faltan días', () => {
    expect(needsUpload(status({ level: 'ok', missing_days: 0 }))).toBe(false)
    expect(needsUpload(status())).toBe(true)
    expect(needsUpload(status({ level: 'warning', missing_days: 5 }))).toBe(true)
  })

  it('dice hasta cuándo llegan y cuántos días faltan', () => {
    expect(arisNoticeText(status()).title).toMatch(/falta el día de ayer/)
    expect(arisNoticeText(status({ missing_days: 4 })).title).toMatch(/faltan 4 días/)
    expect(arisNoticeText(status({ last_dispatch: null })).title).toMatch(/Todavía no hay datos/)
  })

  it('resume lo cargado', () => {
    const text = arisLoadSummary([
      { kind: 'despacho', rows: 1250, skipped: 0, date_from: '2026-11-16', date_to: '2026-11-16' },
      { kind: 'ventas', rows: 30, skipped: 2, date_from: '2026-11-10', date_to: '2026-11-16' },
    ])
    expect(text).toMatch(/líneas de despacho del/)
    expect(text).toMatch(/2 filas no se pudieron leer/)
  })

  it('desde la app solo entran archivos de hasta 4 MB', () => {
    expect(tooBig({ size: ARIS_MAX_BYTES })).toBe(false)
    expect(tooBig({ size: ARIS_MAX_BYTES + 1 })).toBe(true)
    expect(tooBig({ size: 58 * 1024 * 1024 })).toBe(true)
  })

  it('rechaza un estado con forma inválida', () => {
    expect(arisStatusSchema.safeParse({ level: 'raro' }).success).toBe(false)
  })
})
