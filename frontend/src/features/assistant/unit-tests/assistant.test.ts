import { describe, expect, it } from 'vitest'
import {
  assistantReplySchema,
  currentSuggestions,
  MAX_MESSAGE,
  sendable,
  type ChatMessage,
} from '@/features/assistant/domain/assistant'

const msg = (from: ChatMessage['from'], id = 1): ChatMessage => ({ id, from, text: 'x' })

describe('asistente', () => {
  it('no envía preguntas vacías ni demasiado largas', () => {
    expect(sendable('  ¿Saca de hoy?  ')).toBe('¿Saca de hoy?')
    expect(sendable('   ')).toBeNull()
    expect(sendable('x'.repeat(MAX_MESSAGE + 1))).toBeNull()
  })

  it('al empezar ofrece las preguntas del rol; después, las que propuso la respuesta', () => {
    const starters = ['a', 'b', 'c', 'd']
    expect(currentSuggestions([], starters, [])).toEqual(starters)
    expect(currentSuggestions([msg('user'), msg('assistant', 2)], starters, ['¿Y mañana?'])).toEqual(['¿Y mañana?'])
    // Si falló, vuelve a ofrecer algunas de inicio.
    expect(currentSuggestions([msg('user'), msg('error', 2)], starters, [])).toEqual(['a', 'b', 'c'])
  })

  it('valida la respuesta del servidor', () => {
    expect(assistantReplySchema.safeParse({ reply: 'Hola', suggestions: ['¿Y?'] }).success).toBe(true)
    expect(assistantReplySchema.safeParse({ reply: 'Hola' }).success).toBe(false)
  })
})
