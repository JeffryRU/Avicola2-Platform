import { ChevronRight, KeyRound, Layers, LogOut, Send } from 'lucide-react'
import { Link } from 'react-router'
import { useContainer } from '@/app/di'
import { InstallOption } from '@/app/install'
import { paths } from '@/app/routes'
import { initials } from '@/core/domain/format'
import { roleLabel } from '@/modules/auth/domain/session'
import { useRequiredSession } from '@/modules/auth/ui/use-session'
import { useQueue } from '@/modules/planning/ui/hooks'
import { BRANDS, useBrand, type BrandId } from '@/ui/components/brand'
import { PageBody, PageHeader, Section } from '@/ui/components/layout'
import { cn } from '@/ui/lib/utils'

const optCls =
  'flex w-full flex-wrap items-center gap-3.5 border-b border-muted px-5 py-4 text-left last:border-0 dsk:flex-nowrap'
const tileCls = 'grid size-10 flex-none place-items-center rounded-xl [&>svg]:size-5'

export function ProfilePage({ onBrandChange }: { onBrandChange: () => void }) {
  const { auth } = useContainer()
  const { seller } = useRequiredSession()
  const { brand, setBrand } = useBrand()
  const pending = useQueue().filter((q) => q.seller === seller.username).length

  const choose = (b: BrandId) => {
    if (b === brand) return
    setBrand(b)
    onBrandChange()
  }

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
          <div className={optCls}>
            <span className={cn(tileCls, 'bg-secondary text-primary')}>
              <Layers />
            </span>
            <span className="min-w-0 flex-[1_1_160px]">
              <b className="block">Marca de la app</b>
              <small className="text-muted-foreground">Cambia los colores y el logo</small>
            </span>
            <div
              role="group"
              aria-label="Marca"
              className="ml-[54px] inline-flex rounded-[10px] bg-muted p-[3px] dsk:ml-0"
            >
              {(Object.keys(BRANDS) as BrandId[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={brand === b}
                  onClick={() => choose(b)}
                  className={cn(
                    'rounded-lg px-3 py-[7px] text-[13px] font-bold text-ink-2',
                    brand === b && 'bg-white text-primary shadow-sm',
                  )}
                >
                  {BRANDS[b].name}
                </button>
              ))}
            </div>
          </div>
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
          <Link to={paths.connection} className={optCls}>
            <span className={cn(tileCls, 'bg-ok-soft text-ok')}>
              <Send />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block">Conexión</b>
              <small className="text-muted-foreground">
                Base de datos{pending ? `, ${pending} por sincronizar` : ''}
              </small>
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
