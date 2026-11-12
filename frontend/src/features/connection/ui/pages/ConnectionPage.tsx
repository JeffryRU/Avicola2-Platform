import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Layers, RefreshCw, Send, User } from 'lucide-react'
import { toast } from 'sonner'
import { paths } from '@/app/routes'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { SummaryRow } from '@/features/projections/ui/components/review-dialog'
import { useFlushQueue, useQueue } from '@/features/projections/ui/hooks'
import { useStatus } from '@/features/connection/ui/hooks'
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
  const client = useQueryClient()
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
    await client.invalidateQueries()
    toast.success('Datos actualizados desde la base')
  }

  return (
    <div>
      <PageHeader title="Conexión" subtitle="Dónde se guardan las proyecciones." back={paths.profile} />
      <PageBody className="dsk:max-w-[760px]">
        <Section className="mb-3.5">
          <div className="grid gap-3.5 px-4 pt-[18px] pb-4 dsk:px-5 dsk:pb-5">
            {status.isLoading ? (
              <p className="text-muted-foreground">Comprobando conexión…</p>
            ) : ok ? (
              <Note tone="ok" icon={<Check />}>
                <div>
                  <b>Conectado a la base de datos.</b>
                  <br />
                  Las proyecciones se guardan en {s.database_name}
                  {s.schema ? ` (${s.schema})` : ''}.
                </div>
              </Note>
            ) : (
              <Note tone="warn" icon={<AlertCircle />}>
                <div>
                  <b>Sin conexión a la base de datos.</b>
                  <br />
                  {s?.database
                    ? 'Conectado, pero faltan las tablas (ejecuta las migraciones).'
                    : (s?.error ?? status.error?.message)}
                  <br />
                  Mientras tanto, las proyecciones quedan en este dispositivo.
                </div>
              </Note>
            )}
            {s && (
              <div className="grid">
                <SummaryRow icon={<Layers />} label="Motor">
                  {DIALECTS[s.dialect] ?? s.dialect}
                </SummaryRow>
                <SummaryRow icon={<Send />} label="Base de datos">
                  {s.database_name ?? '-'}
                </SummaryRow>
                <SummaryRow icon={<User />} label="Sesión">
                  {seller.name}
                  <small>{seller.username}</small>
                </SummaryRow>
              </div>
            )}
            <div className="flex flex-wrap gap-2.5">
              <Button
                variant="outline"
                className="h-[46px] border-[1.5px] border-primary font-bold text-primary"
                onClick={test}
              >
                <RefreshCw /> Probar conexión
              </Button>
              {pending > 0 && (
                <Button className="h-[46px] font-bold" onClick={flush}>
                  <Send /> Enviar {pending} pendiente(s)
                </Button>
              )}
              <Button variant="ghost" className="h-[46px] font-bold text-ink-2" onClick={reload}>
                <RefreshCw /> Recargar datos
              </Button>
            </div>
          </div>
        </Section>
        <Section>
          <div className="px-4 pt-[18px] pb-4 text-sm text-ink-2 dsk:px-5 dsk:pb-5">
            <b className="text-[15px] text-foreground">Cómo funciona</b>
            <ul className="mt-2 grid list-disc gap-1 pl-5">
              <li>
                El backend decide la base por <code className="rounded-md bg-muted px-1.5">DATABASE_URL</code>: Supabase
                hoy, Azure SQL cuando se necesite.
              </li>
              <li>Sin conexión, cada envío queda en este dispositivo y se reenvía solo al volver la red.</li>
            </ul>
            <p className="mt-2.5">
              La venta real (ERP) de los dashboards todavía es simulada; las proyecciones sí son reales.
            </p>
          </div>
        </Section>
      </PageBody>
    </div>
  )
}
