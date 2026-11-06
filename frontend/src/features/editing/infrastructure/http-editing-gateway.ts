import { z } from 'zod'
import type { HttpClient } from '@/shared/application/ports'
import type { IsoDate } from '@/shared/domain/dates'
import type { EditingGateway } from '@/features/editing/application/ports'
import { cutoffSchema, editingWindowSchema, unlockSchema, type UnlockAction } from '@/features/editing/domain/editing'

export class HttpEditingGateway implements EditingGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  window = () => this.http.get('/editing', editingWindowSchema)

  unlocks = () => this.http.get('/editing/unlocks', z.array(unlockSchema))

  request = (date: IsoDate, reason: string) => this.http.post('/editing/unlocks', { date, reason }, unlockSchema)

  decide = (id: number, action: UnlockAction) =>
    this.http.post(`/admin/editing/unlocks/${String(id)}`, { action }, unlockSchema)

  updateCutoff = (cutoffTime: string, daysBefore: number, enabled: boolean) =>
    this.http.put('/admin/editing/cutoff', { cutoff_time: cutoffTime, days_before: daysBefore, enabled }, cutoffSchema)

  grant = (username: string, dates: IsoDate[]) =>
    this.http.post(`/admin/editing/sellers/${encodeURIComponent(username)}/grant`, { dates }, z.array(unlockSchema))

  revoke = (username: string) =>
    this.http.post(`/admin/editing/sellers/${encodeURIComponent(username)}/revoke`, {}, z.array(unlockSchema))
}
