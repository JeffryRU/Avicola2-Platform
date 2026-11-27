import { dDowLong, dFull, today } from '@/shared/domain/dates'
import { TeamDayView } from '@/features/dashboards'

/** Inicio del supervisor: cómo va hoy el equipo (quién confirmó, cuánto y qué falta). */
export function SupervisorHomePage() {
  const now = today()
  return (
    <TeamDayView date={now} title="Cómo va el equipo hoy" subtitle={`${dDowLong(now)} ${dFull(now)}`} back={null} />
  )
}
