import { addDays, dShort, weekLabel, weekStart, type IsoDate } from '@/core/domain/dates'

export type NotificationKind = 'pending' | 'sales' | 'summary' | 'catalog'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  when: string
}

/**
 * Avisos de la app. "Pendiente" sale del estado real; los demás son informativos, como en el
 * mockup, hasta que n8n los genere (alertas de la plataforma).
 */
export function buildNotifications(today: IsoDate, todayConfirmed: boolean): AppNotification[] {
  const list: AppNotification[] = []
  if (!todayConfirmed) {
    list.push({
      id: `pending-${today}`,
      kind: 'pending',
      title: 'Proyección pendiente',
      body: `Tu proyección de hoy (${dShort(today)}) aún no está confirmada.`,
      when: 'Hoy',
    })
  }
  const yesterday = addDays(today, -1)
  list.push(
    {
      id: `sales-${yesterday}`,
      kind: 'sales',
      title: 'Ventas del ERP actualizadas',
      body: `Ya puedes comparar la venta real de ${dShort(yesterday)}.`,
      when: 'Hoy',
    },
    {
      id: `summary-${weekStart(today)}`,
      kind: 'summary',
      title: 'Resumen semanal disponible',
      body: `La semana del ${weekLabel(addDays(weekStart(today), -7))} ya cerró. Revisa su exactitud.`,
      when: 'Lunes',
    },
    {
      id: 'catalog-broaster',
      kind: 'catalog',
      title: 'Catálogo actualizado',
      body: 'Se agregó la categoría BROASTER con 6 presentaciones.',
      when: 'Esta semana',
    },
  )
  return list
}
