import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import { endpoints } from '@/shared/infrastructure/api/endpoints'
import type { NotificationsGateway } from '@/features/notifications/application/ports'
import { notificationPageSchema, type NotificationRange } from '@/features/notifications/domain/notifications'

export class HttpNotificationsGateway implements NotificationsGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  list = (range?: NotificationRange | null) =>
    this.http.get(
      endpoints.notifications.list,
      notificationPageSchema,
      range ? { date_from: range.from, date_to: range.to, limit: 100 } : undefined,
    )

  markRead = async (ids?: number[]) => {
    await this.http.post(endpoints.notifications.read, ids ? { ids } : {}, z.object({ updated: z.number() }))
  }
}
