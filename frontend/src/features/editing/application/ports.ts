import type { IsoDate } from '@/shared/domain/dates'
import type { Cutoff, EditingWindow, Unlock, UnlockAction } from '@/features/editing/domain/editing'

/** Hora de corte y habilitaciones de edición. */
export interface EditingGateway {
  /** Días que el usuario puede registrar, hasta cuándo y si tiene habilitación. */
  window(): Promise<EditingWindow>
  /** El vendedor ve las suyas; el supervisor, las de todos. */
  unlocks(): Promise<Unlock[]>
  request(date: IsoDate, reason: string): Promise<Unlock>
  decide(id: number, action: UnlockAction): Promise<Unlock>
  updateCutoff(cutoffTime: string, daysBefore: number): Promise<Cutoff>
}
