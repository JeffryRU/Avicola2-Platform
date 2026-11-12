import type { IsoDate } from '@/shared/domain/dates'
import type { StockDay, StockEntry, StockOptions } from '@/features/stock/domain/stock'

/** Stock de despacho (el backend decide quién lo ve y quién lo registra). */
export interface StockGateway {
  /** Días con registro en el rango, del más reciente al más antiguo. */
  list(from: IsoDate, to: IsoDate): Promise<StockDay[]>
  /** Artículos (con calidad B) y ubicaciones para armar el formulario. */
  options(): Promise<StockOptions>
  /** Registra o corrige el stock de un día en una ubicación (reemplaza lo de esa ubicación). */
  register(day: IsoDate, location: string, lines: StockEntry[]): Promise<StockDay>
}
