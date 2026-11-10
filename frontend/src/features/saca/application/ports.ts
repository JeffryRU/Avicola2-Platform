import type { IsoDate } from '@/shared/domain/dates'
import type { Saca } from '@/features/saca/domain/saca'

/** Cuánto pedir a granja para un día (el backend decide quién lo ve). */
export interface SacaGateway {
  plan(day: IsoDate): Promise<Saca>
}
