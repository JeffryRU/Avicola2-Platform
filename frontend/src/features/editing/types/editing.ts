/** Textos de la hora de corte y las habilitaciones de edición (única fuente). */
import { dShort, type IsoDate } from '@/shared/domain/dates'
import { dateOf, timeOf, type UnlockAction, type UnlockStatus } from '@/features/editing/domain/editing'

export const UNLOCKS_TITLE = 'Habilitaciones'
export const UNLOCKS_SUBTITLE = 'Horario de corte y solicitudes para editar días cerrados.'
export const CUTOFF_TITLE = 'Horario de corte'
export const REQUESTS_TITLE = 'Solicitudes'
export const NO_REQUESTS_LABEL = 'No hay solicitudes en los últimos 30 días.'
export const REQUEST_UNLOCK_LABEL = 'Pedir habilitación'
export const REQUEST_TITLE = 'Pedir habilitación'
export const REASON_LABEL = 'Motivo'
export const REASON_PLACEHOLDER = 'Por ejemplo: el cliente aumentó su pedido después del corte.'
export const SEND_REQUEST_LABEL = 'Enviar solicitud'
export const CANCEL_LABEL = 'Cancelar'
export const SAVE_LABEL = 'Guardar'
export const CUTOFF_TIME_LABEL = 'Hora de corte'
export const DAYS_BEFORE_LABEL = 'Cierra'
export const EDITABLE_DAYS_TITLE = 'Días que puedes registrar'
export const LOCK_LABEL = 'Bloquear el registro a la hora de corte'
export const LOCK_OFF_RULE =
  'El bloqueo está apagado: los vendedores registran y editan cualquier día de la ventana, sin hora límite.'
export const EDITING_COLUMN_LABEL = 'Edición de proyecciones'
export const GRANT_LABEL = 'Habilitar edición'
export const REVOKE_LABEL = 'Cerrar edición'
export const GRANT_DAYS_LABEL = 'Días que podrá editar'
export const GRANT_HINT =
  'Podrá registrar o corregir esos días aunque haya pasado la hora de corte, hasta que cierres la edición. Le llega un aviso.'
export const grantDone = (name: string) => `Edición habilitada para ${name}.`
export const revokeDone = (name: string) => `Edición cerrada para ${name}.`
export const grantedLabel = (dates: IsoDate[]) => `Habilitada: ${dates.map(dShort).join(', ')}`
export const PAST_CUTOFF_LABEL = 'Ya cerró'

export const UNLOCK_STATUS_LABEL: Record<UnlockStatus, string> = {
  requested: 'Pendiente',
  approved: 'Habilitada',
  rejected: 'Rechazada',
  closed: 'Cerrada',
}

export const UNLOCK_ACTION_LABEL: Record<UnlockAction, string> = {
  approve: 'Habilitar',
  reject: 'Rechazar',
  close: 'Cerrar edición',
}

export const UNLOCK_ACTION_DONE: Record<UnlockAction, string> = {
  approve: 'Edición habilitada.',
  reject: 'Solicitud rechazada.',
  close: 'Edición cerrada.',
}

/** Opciones de «Cierra»: el mismo día o con días de anticipación. */
export const daysBeforeLabel = (n: number) =>
  n === 0 ? 'El mismo día' : n === 1 ? 'El día anterior' : `${String(n)} días antes`

/** "Cada día se puede editar hasta las 07:00 del mismo día." */
export function cutoffRule(time: string, daysBefore: number, enabled = true): string {
  if (!enabled) return LOCK_OFF_RULE
  const when =
    daysBefore === 0
      ? 'de ese mismo día'
      : daysBefore === 1
        ? 'del día anterior'
        : `de ${String(daysBefore)} días antes`
  return `Cada día se puede registrar o editar hasta las ${time} ${when}. Después, el vendedor necesita tu habilitación.`
}

/** "Cierra hoy a las 07:00", "Cerró a las 07:00", "Cierra el Jue 05/11 a las 07:00". */
export function closesLabel(closesAt: string, open: boolean, today: IsoDate): string {
  const day = dateOf(closesAt)
  const at = `a las ${timeOf(closesAt)}`
  if (!open) return day === today ? `Cerró hoy ${at}` : `Cerró el ${dShort(day)} ${at}`
  return day === today ? `Cierra hoy ${at}` : `Cierra el ${dShort(day)} ${at}`
}

export const requestSentLabel = (date: IsoDate) => `Solicitud enviada para el ${dShort(date)}.`
export const closedDaysNote = (dates: IsoDate[]) =>
  `${dates.map(dShort).join(', ')} ya ${dates.length === 1 ? 'cerró' : 'cerraron'}. Pide habilitación o elige otros días.`
export const requestFor = (date: IsoDate) =>
  `Para editar el ${dShort(date)}, que ya cerró. El supervisor recibirá el aviso.`

/** Pantalla del vendedor para pedir que le abran un día y seguir sus solicitudes. */
export const MY_REQUESTS_TITLE = 'Solicitudes de apertura'
export const MY_REQUESTS_NAV = 'Solicitudes'
export const MY_REQUESTS_SUBTITLE = 'Pide que te abran un día que ya cerró y mira qué pasó con lo que pediste.'
export const MY_REQUESTS_HINT =
  'En los días cerrados aparece «Pedir habilitación». El supervisor recibe el pedido y decide; te llega un aviso con la respuesta.'
export const MY_REQUESTS_LIST_TITLE = 'Mis solicitudes'
export const MY_REQUESTS_EMPTY = 'No pediste ninguna apertura en los últimos 30 días.'
export const decidedByLabel = (status: UnlockStatus, by: string) =>
  status === 'approved' ? `la habilitó ${by}` : status === 'rejected' ? `la rechazó ${by}` : `la cerró ${by}`
