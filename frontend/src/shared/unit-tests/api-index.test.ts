import { describe, expect, it } from 'vitest'
import { queryKeys } from '@/shared/application/query-keys'
import { apiUrl, endpoints } from '@/shared/infrastructure/api/endpoints'

describe('índice de endpoints', () => {
  it('codifica los parámetros de ruta', () => {
    expect(endpoints.accounts.role('ana maría/1')).toBe('/admin/accounts/ana%20mar%C3%ADa%2F1/role')
    expect(endpoints.editing.decide(7)).toBe('/admin/editing/unlocks/7')
    expect(endpoints.stock.day('2026-11-12')).toBe('/stock/2026-11-12')
  })

  it('arma la URL completa sin barras dobles', () => {
    expect(apiUrl('/api', endpoints.events.stream)).toBe('/api/events')
    expect(apiUrl('https://x.test/api/', endpoints.logs.client)).toBe('https://x.test/api/client-logs')
  })
})

describe('claves de consulta', () => {
  const startsWith = (key: readonly unknown[], prefix: readonly unknown[]) => prefix.every((part, i) => key[i] === part)

  it('cada consulta cuelga del prefijo de su módulo (invalidar `all` la alcanza)', () => {
    expect(startsWith(queryKeys.projections.range('2026-11-01', '2026-11-30'), queryKeys.projections.all)).toBe(true)
    expect(startsWith(queryKeys.saca.plan('2026-11-13'), queryKeys.saca.all)).toBe(true)
    expect(startsWith(queryKeys.stock.options, queryKeys.stock.all)).toBe(true)
    expect(startsWith(queryKeys.production.forecast([2.4, 2.6]), queryKeys.production.all)).toBe(true)
    expect(startsWith(queryKeys.editing.unlocks, queryKeys.editing.all)).toBe(true)
  })

  it('las sugerencias no dependen de las proyecciones', () => {
    expect(startsWith(queryKeys.suggestions.get('BRASA', '2026-11-13', 3), queryKeys.projections.all)).toBe(false)
  })
})
