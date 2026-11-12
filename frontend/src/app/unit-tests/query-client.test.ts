import { describe, expect, it } from 'vitest'
import { retryDelay, shouldRetry } from '@/app/query-client'
import { ApiError } from '@/shared/application/ports'

describe('reintentos de las consultas', () => {
  it('reintenta una vez solo las fallas pasajeras', () => {
    expect(shouldRetry(0, new ApiError('sin red', 0))).toBe(true)
    expect(shouldRetry(0, new ApiError('saturado', 503))).toBe(true)
    expect(shouldRetry(1, new ApiError('saturado', 503))).toBe(false)
  })

  it('no reintenta un 4xx, un 500 ni otros errores', () => {
    expect(shouldRetry(0, new ApiError('no autorizado', 401))).toBe(false)
    expect(shouldRetry(0, new ApiError('error interno', 500))).toBe(false)
    expect(shouldRetry(0, new Error('otro'))).toBe(false)
  })

  it('espera más en cada intento, con azar acotado', () => {
    expect(retryDelay(0, () => 0)).toBe(2_000)
    expect(retryDelay(1, () => 1)).toBe(5_000)
    expect(retryDelay(10, () => 0)).toBe(30_000)
  })
})
