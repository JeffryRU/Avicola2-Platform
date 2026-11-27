import { describe, expect, it } from 'vitest'
import {
  assistantReplySchema,
  clock,
  conversationDetailSchema,
  conversationListSchema,
  linkCodeSchema,
  messageBlocks,
  numericColumns,
  relativeTime,
  secondsLeft,
  streamEventSchema,
  tableFileName,
  tableQuestions,
  toChatMessages,
} from '@/features/assistant/domain/assistant'

const table = {
  type: 'table',
  title: 'Proyección del 27/11',
  columns: ['Producto', 'Unidades', 'Kg'],
  rows: [['Brasa', '2340', '2340,5']],
}

describe('respuestas con bloques', () => {
  it('lee done con bloques de texto y tabla', () => {
    const event = streamEventSchema.parse({
      type: 'done',
      message_id: 'm1',
      reply: 'texto',
      blocks: [{ type: 'text', text: 'Para mañana…' }, table],
      suggestions: [],
    })
    expect(event.type === 'done' && event.blocks).toHaveLength(2)
    expect(event.type === 'done' && event.message_id).toBe('m1')
  })

  it('un done sin bloques (servidor anterior) sigue valiendo', () => {
    const r = assistantReplySchema.parse({ reply: 'Hola', suggestions: [] })
    expect(r.blocks).toEqual([])
    expect(messageBlocks({ text: 'Hola', blocks: r.blocks })).toEqual([{ type: 'text', text: 'Hola' }])
  })

  it('rechaza un bloque de tipo desconocido', () => {
    expect(
      streamEventSchema.safeParse({ type: 'done', reply: '', suggestions: [], blocks: [{ type: 'x' }] }).success,
    ).toBe(false)
  })

  it('acepta números en las celdas y los pasa a texto', () => {
    const r = assistantReplySchema.parse({
      reply: '',
      suggestions: [],
      blocks: [{ type: 'table', columns: ['a'], rows: [[5]] }],
    })
    expect(r.blocks[0]).toMatchObject({ rows: [['5']] })
  })
})

describe('historial', () => {
  it('valida la lista y el detalle', () => {
    const list = conversationListSchema.parse([
      { id: 'c1', title: 'Saca', channel: 'telegram', updated_at: '2026-11-26T10:00:00Z', preview: null },
    ])
    expect(list[0]?.channel).toBe('telegram')
    expect(conversationListSchema.safeParse([{ id: 'c1', title: 'x', channel: 'sms', updated_at: '' }]).success).toBe(
      false,
    )
    const detail = conversationDetailSchema.parse({
      id: 'c1',
      title: 'Saca',
      channel: 'app',
      messages: [
        { id: 'a', role: 'user', text: 'hola', blocks: null, suggestions: null, created_at: '2026-11-26T10:00:00Z' },
        { id: 'b', role: 'assistant', text: 'x', blocks: [table], suggestions: ['¿Y?'], created_at: null },
      ],
    })
    const chat = toChatMessages(detail, 10)
    expect(chat.map((m) => m.id)).toEqual([10, 11])
    expect(chat[1]).toMatchObject({ from: 'assistant', messageId: 'b' })
    expect(chat[0]?.messageId).toBeUndefined()
  })

  it('dice cuánto hace', () => {
    const now = new Date('2026-11-26T12:00:00Z')
    expect(relativeTime('2026-11-26T11:59:40Z', now)).toBe('hace un momento')
    expect(relativeTime('2026-11-26T11:55:00Z', now)).toBe('hace 5 min')
    expect(relativeTime('2026-11-26T09:00:00Z', now)).toBe('hace 3 h')
    expect(relativeTime('2026-11-25T09:00:00Z', now)).toBe('ayer')
    expect(relativeTime('2026-11-23T09:00:00Z', now)).toBe('hace 3 días')
  })
})

describe('tablas', () => {
  it('el Excel se llama como el título', () => {
    expect(tableFileName('Proyección del 27/11')).toBe('Proyección del 27-11.xlsx')
    expect(tableFileName('  a:b*c?  ')).toBe('a-b-c.xlsx')
    expect(tableFileName(null)).toBe('tabla.xlsx')
    expect(tableFileName('///')).toBe('tabla.xlsx')
  })

  it('arma las preguntas rápidas, con el título si lo hay', () => {
    expect(tableQuestions('Proyección del 27/11')).toEqual([
      '¿Por qué salen estos números en "Proyección del 27/11"?',
      '¿Qué recomiendas para otro día en "Proyección del 27/11"?',
    ])
    expect(tableQuestions(undefined)).toEqual(['¿Por qué salen estos números?', '¿Qué recomiendas para otro día?'])
  })

  it('alinea a la derecha solo las columnas de números', () => {
    expect(numericColumns(table)).toEqual([false, true, true])
    expect(numericColumns({ columns: ['a'], rows: [] })).toEqual([false])
  })
})

describe('vinculación', () => {
  it('valida el código y cuenta el tiempo', () => {
    const code = linkCodeSchema.parse({ code: 'ABC123', expires_at: '2026-11-26T12:10:00Z' })
    const at = new Date('2026-11-26T12:00:55Z').getTime()
    expect(secondsLeft(code.expires_at, at)).toBe(545)
    expect(clock(545)).toBe('9:05')
    expect(secondsLeft(code.expires_at, new Date('2026-11-26T12:11:00Z').getTime())).toBe(0)
    expect(linkCodeSchema.safeParse({ code: 'x' }).success).toBe(false)
  })
})
