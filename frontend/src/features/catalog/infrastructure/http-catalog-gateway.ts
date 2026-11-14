import { z } from 'zod'
import type { CatalogGateway } from '@/features/catalog/application/ports'
import { productSchema } from '@/features/catalog/domain/schemas'
import type { HttpClient } from '@/shared/application/ports'
import { endpoints } from '@/shared/infrastructure/api/endpoints'

export class HttpCatalogGateway implements CatalogGateway {
  private readonly http: HttpClient
  constructor(http: HttpClient) {
    this.http = http
  }

  catalog = () => this.http.get(endpoints.catalog.list, z.array(productSchema))
}
