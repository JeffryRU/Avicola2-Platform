import { describe, expect, it } from 'vitest'
import { weekOptions } from '@/features/dashboards/domain/weeks'

describe('filtro de semanas', () => {
  it('ofrece la semana actual y las 3 anteriores, desde el lunes', () => {
    expect(weekOptions('2026-11-05')).toEqual(['2026-11-02', '2026-10-26', '2026-10-19', '2026-10-12'])
  })
})
