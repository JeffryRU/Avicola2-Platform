import { z } from 'zod'
import type { HttpClient } from '@/core/application/ports'
import type { NotificationsGateway } from '@/modules/notifications/application/ports'
import { notificationPageSchema } from '@/modules/notifications/domain/notifications'

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
