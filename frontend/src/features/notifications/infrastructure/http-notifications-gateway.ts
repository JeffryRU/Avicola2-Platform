import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import type { NotificationsGateway } from '@/features/notifications/application/ports'
import { notificationPageSchema } from '@/features/notifications/domain/notifications'

export class HttpNotificationsGateway implements NotificationsGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  list = () => this.http.get('/notifications', notificationPageSchema)

  markRead = async (ids?: number[]) => {
    await this.http.post('/notifications/read', ids ? { ids } : {}, z.object({ updated: z.number() }))
  }
}
