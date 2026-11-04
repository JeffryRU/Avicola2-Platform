import { ChevronRight, History, KeyRound, LockOpen, LogOut, UserCog } from 'lucide-react'
import { Link } from 'react-router'
import { useContainer } from '@/app/di'
import { InstallOption } from '@/app/install'
import { paths } from '@/app/routes'
import { initials } from '@/shared/domain/format'
import { isSupervisor, roleLabel } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'

const optCls =
  'flex w-full flex-wrap items-center gap-3.5 border-b border-muted px-5 py-4 text-left last:border-0 dsk:flex-nowrap'
const tileCls = 'grid size-10 flex-none place-items-center rounded-xl [&>svg]:size-5'

export function ProfilePage() {
  const { auth } = useContainer()
  const { seller } = useRequiredSession()
  return (
    <div>
      <PageHeader title="Perfil" />
      <PageBody className="dsk:max-w-[720px]">
        <Section className="mb-3.5 flex items-center gap-4 p-5">
          <div className="grid size-16 flex-none place-items-center rounded-full bg-secondary text-[22px] font-extrabold text-primary">
            {initials(seller.name)}
          </div>
          <div>
            <b className="block text-xl">{seller.name}</b>
            <span className="text-muted-foreground">{roleLabel(seller)}</span>
          </div>
        </Section>
        <Section>
          <Link to={paths.profileSettings} className={optCls}>
            <span className={cn(tileCls, 'bg-secondary text-primary')}>
              <UserCog />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block">Configuración de perfil</b>
              <small className="text-muted-foreground">Tu nombre y los datos de tu cuenta</small>
            </span>
            <ChevronRight className="size-[18px]" />
          </Link>
          {isSupervisor(seller) && (
            <Link to={paths.unlocks} className={optCls}>
              <span className={cn(tileCls, 'bg-ok-soft text-ok')}>
                <LockOpen />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block">Habilitaciones</b>
                <small className="text-muted-foreground">Horario de corte y solicitudes de edición</small>
              </span>
              <ChevronRight className="size-[18px]" />
            </Link>
          )}
          <Link to={paths.history} className={optCls}>
            <span className={cn(tileCls, 'bg-secondary text-primary')}>
              <History />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block">Historial de cambios</b>
              <small className="text-muted-foreground">Quién creó o modificó cada proyección</small>
            </span>
            <ChevronRight className="size-[18px]" />
          </Link>
          <InstallOption className={optCls} />
          <Link to={paths.password} className={optCls}>
            <span className={cn(tileCls, 'bg-warn-soft text-warn')}>
              <KeyRound />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block">Cambiar contraseña</b>
              <small className="text-muted-foreground">Cierra tus sesiones en otros equipos</small>
            </span>
            <ChevronRight className="size-[18px]" />
          </Link>
          <button type="button" className={optCls} onClick={auth.logout}>
            <span className={cn(tileCls, 'bg-bad-soft text-destructive')}>
              <LogOut />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block">Cerrar sesión</b>
              <small className="text-muted-foreground">Volver a la pantalla de inicio de sesión</small>
            </span>
            <ChevronRight className="size-[18px]" />
          </button>
        </Section>
      </PageBody>
    </div>
  )
}
