import { dDowLong, dFull, greeting, today } from '@/shared/domain/dates'
import { useRequiredSession } from '@/features/auth'
import { TeamDayView } from '@/features/dashboards'

/** Inicio del supervisor: cómo va hoy el equipo (quién confirmó, cuánto y qué falta). */
export function SupervisorHomePage() {
  const { seller } = useRequiredSession()
  const now = today()
  return (
    <TeamDayView
      date={now}
      title={`${greeting()}, ${seller.name.split(' ')[0]}!`}
      subtitle={`Así va hoy el equipo · ${dDowLong(now)} ${dFull(now)}`}
      back={null}
    />
  )
}
