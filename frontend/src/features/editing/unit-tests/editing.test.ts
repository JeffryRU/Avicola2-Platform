import { describe, expect, it } from 'vitest'
import {
  activeUnlocks,
  countByStatus,
  filterUnlocks,
  groupByDay,
  NO_UNLOCK_FILTER,
  closedDays,
  cutoffFormSchema,
  defaultGrantDays,
  type EditingWindow,
  pastCutoff,
  sortUnlocks,
  type Unlock,
  unlockRequestSchema,
} from '@/features/editing/domain/editing'
import { timeOf } from '@/shared/domain/dates'
import { closesLabel, cutoffRule } from '@/features/editing/types/editing'

const day = (date: string, open: boolean) => ({ date, closes_at: `${date}T07:00:00-05:00`, open, unlock: null })
const WINDOW: EditingWindow = {
  policy: { cutoff_time: '07:00', days_before: 0, open_days: 3, starts_in: 0, enabled: true },
  days: [day('2026-11-04', false), day('2026-11-05', true), day('2026-11-06', true)],
}

const unlock = (id: number, status: Unlock['status'], date = '2026-11-04', seller = 'rnavarro'): Unlock => ({
  id,
  seller,
  date,
  reason: 'x',
  status,
  requested_at: '2026-11-04T08:00:00-05:00',
  decided_by: null,
  decided_at: null,
})

describe('hora de corte', () => {
  it('detecta los días elegidos que ya cerraron', () => {
    expect(closedDays(WINDOW, ['2026-11-04', '2026-11-05'])).toEqual(['2026-11-04'])
    expect(closedDays(undefined, ['2026-11-04'])).toEqual([])
  })

  it('lee la hora de corte tal cual, sin la zona del navegador', () => {
    expect(timeOf('2026-11-05T07:00:00-05:00')).toBe('07:00')
    expect(closesLabel('2026-11-04T07:00:00-05:00', false, '2026-11-04')).toBe('Cerró hoy a las 07:00')
    expect(closesLabel('2026-11-05T07:00:00-05:00', true, '2026-11-04')).toBe('Cierra el Jue 05/11 a las 07:00')
  })

  it('explica la regla según los días de anticipación', () => {
    expect(cutoffRule('07:00', 0)).toContain('07:00 de ese mismo día')
    expect(cutoffRule('19:00', 1)).toContain('19:00 del día anterior')
    expect(cutoffRule('19:00', 1, false)).toContain('apagado')
  })

  it('sabe si pasó el corte de un día, y no con el bloqueo apagado', () => {
    const at = new Date('2026-11-05T08:00:00-05:00')
    expect(pastCutoff(WINDOW, WINDOW.days[1], at)).toBe(true)
    expect(pastCutoff(WINDOW, WINDOW.days[2], at)).toBe(false)
    const off = { ...WINDOW, policy: { ...WINDOW.policy, enabled: false } }
    expect(pastCutoff(off, WINDOW.days[1], at)).toBe(false)
  })

  it('agrupa por vendedor las habilitaciones vigentes (la última de cada día)', () => {
    const map = activeUnlocks(
      [
        unlock(1, 'approved', '2026-11-05'),
        unlock(2, 'closed', '2026-11-05'), // la cerró después: ya no rige
        unlock(3, 'approved', '2026-11-07'),
        unlock(4, 'approved', '2026-11-06'),
        unlock(5, 'approved', '2026-11-03'), // ya pasó
        unlock(6, 'requested', '2026-11-06', 'hdias'),
      ],
      '2026-11-05',
    )
    expect(map.get('rnavarro')?.map((u) => u.date)).toEqual(['2026-11-06', '2026-11-07'])
    expect(map.has('hdias')).toBe(false)
  })

  it('valida la hora y el motivo', () => {
    expect(cutoffFormSchema.safeParse({ cutoff_time: '7:00', days_before: 0, enabled: true }).success).toBe(false)
    expect(cutoffFormSchema.safeParse({ cutoff_time: '07:00', days_before: 0, enabled: false }).success).toBe(true)
    expect(unlockRequestSchema.safeParse({ date: '2026-11-04', reason: '   ' }).success).toBe(false)
    expect(unlockRequestSchema.parse({ date: '2026-11-04', reason: ' pedido  extra ' }).reason).toBe('pedido extra')
  })

  it('ordena las solicitudes: pendientes, habilitadas y luego el historial', () => {
    const sorted = sortUnlocks([
      unlock(1, 'closed'),
      unlock(2, 'requested'),
      unlock(3, 'approved'),
      unlock(4, 'requested'),
    ])
    expect(sorted.map((u) => u.id)).toEqual([4, 2, 3, 1])
  })
})

describe('habilitar edición desde Usuarios', () => {
  it('marca los días que ya cerraron o, si ninguno, el primero', () => {
    expect(defaultGrantDays(WINDOW, new Date('2026-11-05T08:00:00-05:00'))).toEqual(['2026-11-04', '2026-11-05'])
    expect(defaultGrantDays(WINDOW, new Date('2026-11-03T08:00:00-05:00'))).toEqual(['2026-11-04'])
  })
})

describe('filtro de solicitudes (Habilitaciones)', () => {
  const u = (id: number, seller: string, date: string, status: Unlock['status'], reason = 'motivo'): Unlock => ({
    id,
    seller,
    date,
    reason,
    status,
    requested_at: '2026-11-12T11:14:00-05:00',
    decided_by: null,
    decided_at: null,
  })
  const list = [
    u(1, 'hdias', '2026-11-13', 'closed'),
    u(2, 'hdias', '2026-11-14', 'requested', 'El cliente aumentó'),
    u(3, 'rnavarro', '2026-11-13', 'approved'),
  ]
  const name = (s: string) => ({ hdias: 'Hebert Días', rnavarro: 'Roberto Navarro' })[s] ?? s

  it('filtra por estado, vendedor, días y texto (sin tildes ni mayúsculas)', () => {
    expect(filterUnlocks(list, { ...NO_UNLOCK_FILTER, status: 'requested' }, name).map((x) => x.id)).toEqual([2])
    expect(filterUnlocks(list, { ...NO_UNLOCK_FILTER, seller: 'hdias' }, name).map((x) => x.id)).toEqual([1, 2])
    expect(
      filterUnlocks(list, { ...NO_UNLOCK_FILTER, from: '2026-11-14', to: '2026-11-14' }, name).map((x) => x.id),
    ).toEqual([2])
    expect(filterUnlocks(list, { ...NO_UNLOCK_FILTER, text: 'hebert dias' }, name)).toHaveLength(2)
    expect(filterUnlocks(list, { ...NO_UNLOCK_FILTER, text: 'AUMENTO' }, name).map((x) => x.id)).toEqual([2])
  })

  it('cuenta por estado y agrupa por día (el más reciente primero)', () => {
    expect(countByStatus(list)).toEqual({ requested: 1, approved: 1, rejected: 0, closed: 1 })
    expect(groupByDay(list).map((g) => [g.date, g.items.map((x) => x.id)])).toEqual([
      ['2026-11-14', [2]],
      ['2026-11-13', [3, 1]],
    ])
  })
})
