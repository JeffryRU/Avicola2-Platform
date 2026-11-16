import { describe, expect, it } from 'vitest'
import { profileSchema } from '@/features/profile/domain/profile'

describe('perfil', () => {
  it('normaliza los espacios del nombre y exige uno', () => {
    expect(profileSchema.parse({ name: '  Ana   Torres ' }).name).toBe('Ana Torres')
    expect(profileSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('acepta hasta 100 caracteres', () => {
    expect(profileSchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true)
    expect(profileSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })
})
