import type { IsoDate } from '@/shared/domain/dates'
import type { Saca } from '@/features/saca/domain/saca'

/** Cuánto pedir a granja (el backend decide quién lo ve). */
export interface SacaGateway {
  /** Cálculo hecho el día `day`: stock de hasta hoy, pedidos de mañana y proyección de pasado mañana. */
  plan(day: IsoDate): Promise<Saca>
  /** Solo supervisores: el plus de aves que se suma a cada tipo. */
  setPlus(plus: Record<string, number>): Promise<Record<string, number>>
}
