import { describe, expect, it } from 'vitest'
import { realtimeEventSchema } from '@/features/notifications/domain/events'
import { notificationPageSchema, safeLink, whenLabel } from '@/features/notifications/domain/notifications'

const NOTIFICATION = {
  id: 1,
  kind: 'projection_submitted',
  title: 'Proyección de María Ríos',
  body: 'Registró 1 día de BRASA (10 unid.) desde el 03/11.',
  link: '/dashboards/estado',
  created_at: '2026-11-03T09:37:08Z',
  read_at: null,
}

describe('notificaciones', () => {
  it('valida la respuesta del servidor', () => {
    expect(notificationPageSchema.safeParse({ items: [NOTIFICATION], unread: 1 }).success).toBe(true)
    expect(notificationPageSchema.safeParse({ items: [{ ...NOTIFICATION, id: 'x' }], unread: 1 }).success).toBe(false)
  })

  it('solo sigue enlaces internos de la app', () => {
    expect(safeLink('/registrar')).toBe('/registrar')
    expect(safeLink('https://otro-sitio.example')).toBeNull()
    expect(safeLink('//otro-sitio.example')).toBeNull()
    expect(safeLink(null)).toBeNull()
  })

  it('muestra cuándo llegó en palabras', () => {
    const now = new Date('2026-11-03T15:00:00')
    expect(whenLabel(new Date('2026-11-03T14:59:40').toISOString(), now)).toBe('Ahora')
    expect(whenLabel(new Date('2026-11-03T14:50:00').toISOString(), now)).toBe('Hace 10 min')
    expect(whenLabel(new Date('2026-11-03T08:30:00').toISOString(), now)).toMatch(/^Hoy /)
    expect(whenLabel(new Date('2026-11-02T17:10:00').toISOString(), now)).toMatch(/^Ayer /)
    expect(whenLabel(new Date('2026-10-30T10:00:00').toISOString(), now)).toBe('Vie 30/10')
  })

  it('reconoce los eventos del canal en tiempo real y descarta los desconocidos', () => {
    expect(realtimeEventSchema.parse({ type: 'notification', data: NOTIFICATION }).type).toBe('notification')
    expect(
      realtimeEventSchema.safeParse({ type: 'session.revoked', data: { reason: 'Tu cuenta fue desactivada.' } })
        .success,
    ).toBe(true)
    expect(realtimeEventSchema.safeParse({ type: 'otra.cosa', data: {} }).success).toBe(false)
  })
})
