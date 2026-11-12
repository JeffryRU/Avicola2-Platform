import { z } from 'zod'
import { sellerSchema } from '@/features/auth/domain/session'
import type { SellersGateway } from '@/features/dashboards/application/ports'
import type { HttpClient } from '@/shared/application/ports'
import { endpoints } from '@/shared/infrastructure/api/endpoints'

export class HttpSellersGateway implements SellersGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  sellers = () => this.http.get(endpoints.sellers.list, z.array(sellerSchema))
}
