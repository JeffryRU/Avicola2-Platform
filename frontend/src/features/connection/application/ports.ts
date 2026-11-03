import type { DbStatus } from '@/features/connection/domain/schemas'

export interface StatusGateway {
  status(): Promise<DbStatus>
}
