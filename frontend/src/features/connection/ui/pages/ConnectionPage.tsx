import { AlertCircle, Check, Layers, RefreshCw, Send, User } from 'lucide-react'
import { toast } from 'sonner'
import { paths } from '@/app/routes'
import { useRequiredSession } from '@/features/auth'
import { SummaryRow } from '@/shared/ui/components/summary-row'
import { useFlushQueue, useQueue } from '@/features/projections'
import { useReloadAll, useStatus } from '@/features/connection/ui/hooks'
import { Note } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'

const DIALECTS: Record<string, string> = {
  postgresql: 'PostgreSQL (Supabase)',
  mssql: 'SQL Server (Azure SQL)',
  sqlite: 'SQLite (memoria / pruebas)',
  mysql: 'MySQL',
}

export function ConnectionPage() {
  const status = useStatus()
  const flushQueue = useFlushQueue()
  const { seller } = useRequiredSession()
  const pending = useQueue().filter((q) => q.seller === seller.username).length
  const reloadAll = useReloadAll()
  const s = status.data
  const ok = Boolean(s?.database) && s?.tables === true

  const test = async () => {
    const r = await status.refetch()
    toast(r.data?.database && r.data.tables ? 'Conexión correcta' : 'Sin conexión')
  }
  const flush = async () => {
    const r = await flushQueue.mutateAsync(seller.username)
    toast(r.sent ? `${r.sent} enviado(s)` : 'No se pudo sincronizar. Se intentará de nuevo.')
  }
  const reload = async () => {
    await reloadAll()
    toast.success('Datos actualizados desde la base')
  }

  return (
    <div>
      <PageHeader title="Conexión" subtitle="Dónde se guardan las proyecciones." back={paths.profile} />
      <PageBody className="grid gap-4">
        {status.isLoading ? (
          <p role="status" className="text-muted-foreground">
            Comprobando conexión…
          </p>
        ) : ok ? (
          <Note tone="ok" icon={<Check />}>
            <div className="min-w-0 flex-1">
              <b className="block">Conectado a la base de datos.</b>
              Las proyecciones se guardan en {s.database_name}
              {s.schema ? ` (${s.schema})` : ''}.
            </div>
          </Note>
        ) : (
          <Note tone="warn" icon={<AlertCircle />}>
            <div className="min-w-0 flex-1">
              <b className="block">Sin conexión a la base de datos.</b>
              {s?.database
                ? 'Conectado, pero faltan las tablas (ejecuta las migraciones).'
                : (s?.error ?? status.error?.message)}
              <br />
              Mientras tanto, las proyecciones quedan en este dispositivo.
            </div>
          </Note>
        )}
        {s && (
          <Section title="Detalle">
            <div className="px-4 dsk:px-5">
              <SummaryRow icon={<Layers />} label="Motor">
                {DIALECTS[s.dialect] ?? s.dialect}
              </SummaryRow>
              <SummaryRow icon={<Send />} label="Base de datos">
                {s.database_name ?? '—'}
              </SummaryRow>
              <SummaryRow icon={<User />} label="Sesión">
                {seller.name}
                <small>{seller.username}</small>
              </SummaryRow>
            </div>
          </Section>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={test}>
            <RefreshCw /> Probar conexión
          </Button>
          {pending > 0 && (
            <Button onClick={flush}>
              <Send /> Enviar <span className="num">{pending}</span> pendiente(s)
            </Button>
          )}
          <Button variant="ghost" onClick={reload}>
            <RefreshCw /> Recargar datos
          </Button>
        </div>
        <Section title="Cómo funciona">
          <div className="px-4 py-3.5 text-base text-ink-2 dsk:px-5">
            <ul className="grid list-disc gap-1 pl-5">
              <li>
                El backend decide la base por{' '}
                <code className="num rounded-sm bg-muted px-1.5 text-sm">DATABASE_URL</code>: Supabase hoy, Azure SQL
                cuando se necesite.
              </li>
              <li>Sin conexión, cada envío queda en este dispositivo y se reenvía solo al volver la red.</li>
            </ul>
            <p className="mt-2.5">
              El pedido real (ERP) de los dashboards todavía es simulada; las proyecciones sí son reales.
            </p>
          </div>
        </Section>
      </PageBody>
    </div>
  )
}
