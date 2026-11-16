import fc from 'fast-check'
import { matchPath } from 'react-router'
import { describe, expect, it } from 'vitest'
import { DASHBOARDS, isFlowPath, paths, routePatterns } from '@/app/routes'

const isoDate = fc
  .date({ min: new Date(2020, 0, 1), max: new Date(2035, 11, 31), noInvalidDate: true })
  .map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)

describe('rutas (una sola fuente)', () => {
  it('las URL no cambian (enlaces guardados y notificaciones las usan)', () => {
    expect(paths.mine).toBe('/proyecciones')
    expect(paths.day('2026-11-05')).toBe('/proyecciones/2026-11-05')
    expect(paths.teamDay('2026-11-05')).toBe('/dashboards/dia/2026-11-05')
    expect([paths.dashSummary, paths.dashVersus, paths.dashStatus]).toEqual([
      '/dashboards/resumen',
      '/dashboards/vs-venta',
      '/dashboards/estado',
    ])
    expect(DASHBOARDS.every((d) => d.to.startsWith(paths.dashboards))).toBe(true)
  })

  it('el patrón del router reconoce la URL que arma paths, con la misma fecha', () => {
    fc.assert(
      fc.property(isoDate, (date) => {
        expect(matchPath(routePatterns.day, paths.day(date))?.params.date).toBe(date)
        expect(matchPath(routePatterns.teamDay, paths.teamDay(date))?.params.date).toBe(date)
      }),
    )
  })

  it('en celular ocultan la barra inferior solo Registrar y el detalle de un día propio', () => {
    fc.assert(
      fc.property(isoDate, (date) => {
        expect(isFlowPath(paths.day(date))).toBe(true)
      }),
    )
    expect(isFlowPath(paths.register)).toBe(true)
    expect(isFlowPath(paths.registered)).toBe(true)
    expect(isFlowPath(paths.mine)).toBe(false)
    expect(isFlowPath(paths.teamDay('2026-11-05'))).toBe(false)
    expect(isFlowPath(paths.home)).toBe(false)
  })
})
