import type { Seller } from '@/features/auth/domain/session'

/** Vendedores visibles para quien consulta (el supervisor ve a todos). */
export interface SellersGateway {
  sellers(): Promise<Seller[]>
}
