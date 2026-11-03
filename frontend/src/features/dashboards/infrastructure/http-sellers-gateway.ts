import { z } from 'zod'
import { sellerSchema } from '@/features/auth/domain/session'
import type { SellersGateway } from '@/features/dashboards/application/ports'
import type { HttpClient } from '@/shared/application/ports'

export class HttpSellersGateway implements SellersGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  sellers = () => this.http.get('/sellers', z.array(sellerSchema))
}
