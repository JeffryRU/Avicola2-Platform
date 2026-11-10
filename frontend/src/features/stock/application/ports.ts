import type { IsoDate } from '@/shared/domain/dates'
import type { StockDay, StockEntry } from '@/features/stock/domain/stock'

/** Stock de despacho (el backend decide quién lo ve y quién lo registra). */
export interface StockGateway {
  /** Días con registro en el rango, del más reciente al más antiguo. */
  list(from: IsoDate, to: IsoDate): Promise<StockDay[]>
  /** Registra o corrige el stock de un día (reemplaza lo anterior). */
  register(day: IsoDate, lines: StockEntry[]): Promise<StockDay>
}
