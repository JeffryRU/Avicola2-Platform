import type { IsoDate } from '@/shared/domain/dates'
import type { Saca, SacaMethod } from '@/features/saca/domain/saca'

/** Cuánto pedir a granja para un día (el backend decide quién lo ve). */
export interface SacaGateway {
  plan(day: IsoDate, method: SacaMethod): Promise<Saca>
  /** Solo supervisores: por cuánto se multiplica lo que hace falta de cada tipo. */
  setFactors(factors: Record<string, number>): Promise<Record<string, number>>
}
