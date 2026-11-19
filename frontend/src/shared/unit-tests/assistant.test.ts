import { describe, expect, it } from 'vitest'
import { assistantUrl } from '@/shared/domain/assistant'

describe('enlace del asistente', () => {
  it('sin enlace no hay botón', () => {
    expect(assistantUrl(undefined)).toBeNull()
    expect(assistantUrl('')).toBeNull()
    expect(assistantUrl('   ')).toBeNull()
  })

  it('solo acepta enlaces http(s)', () => {
    const chat = 'https://n8n.example.com/webhook/abc/chat'
    expect(assistantUrl(` ${chat} `)).toBe(chat)
    expect(assistantUrl('javascript:alert(1)')).toBeNull()
    expect(assistantUrl('n8n.example.com/chat')).toBeNull()
  })
})
