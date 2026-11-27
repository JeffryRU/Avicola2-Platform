import { describe, expect, it } from 'vitest'
import * as production from '@/features/production/types/production'
import * as saca from '@/features/saca/types/saca'
import * as stock from '@/features/stock/types/stock'
import { STOCK_BACK_DAYS } from '@/features/stock/domain/stock'
import { PRODUCTION_BACK_DAYS } from '@/features/production/domain/production'
import { readOnlyDayLabel, RECORDED_EMPTY } from '@/shared/types/daily-record'

/** Textos que antes se repetían en varias features: ahora salen de shared/types y las features los reexportan. */
describe('textos que antes se repetían en varias features', () => {
  it('stock y producción comparten los textos del registro diario', () => {
    for (const texts of [stock, production]) {
      expect(texts.TODAY_LABEL).toBe('Hoy')
      expect(texts.YESTERDAY_LABEL).toBe('Ayer')
      expect(texts.UPDATE_LABEL).toBe('Guardar corrección')
      // Los mismos textos que tenía cada feature antes de centralizarlos.
      expect(texts.REGISTERED_LABEL).toBe('con registro')
      expect(texts.NOT_REGISTERED_TITLE).toBe('Sin registro')
      expect(texts.SUMMARY_TITLE).toBe('Resumen del día')
      expect(texts.STATUS_SAVED).toBe('Registrado')
      expect(texts.STATUS_PENDING).toBe('Sin registrar')
      expect(texts.STATUS_EDITING).toBe('Con cambios sin guardar')
      expect(texts.RECORDED_TITLE).toBe('Últimos registros')
      expect(texts.HISTORY_DAYS).toBe(30)
    }
    expect(RECORDED_EMPTY).toBe('Todavía no hay registros en los últimos 30 días.')
    // Mismo texto que antes, ahora con el número de su regla (STOCK_BACK_DAYS / PRODUCTION_BACK_DAYS).
    expect(readOnlyDayLabel(STOCK_BACK_DAYS)).toBe('Solo se corrigen los últimos 7 días.')
    expect(readOnlyDayLabel(PRODUCTION_BACK_DAYS)).toBe('Solo se corrigen los últimos 7 días.')
    expect(readOnlyDayLabel(3)).toBe('Solo se corrigen los últimos 3 días.')
  })

  it('las acciones comunes salen de un solo lugar', () => {
    expect(saca.CANCEL).toBe('Cancelar')
    expect(saca.SAVE_PLUS).toBe('Guardar')
    expect(saca.TOMORROW_LABEL).toBe('Mañana')
  })
})
