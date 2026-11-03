import { describe, expect, it } from 'vitest'
import { dbStatusSchema } from '@/features/connection/domain/schemas'

describe('estado de la conexión', () => {
  it('acepta la respuesta de /status y rechaza una incompleta', () => {
    const ok = { database: true, tables: true, dialect: 'postgresql', database_name: 'postgres', schema: 'app' }
    expect(dbStatusSchema.parse(ok)).toEqual(ok)
    expect(dbStatusSchema.safeParse({ database: true }).success).toBe(false)
  })
})
