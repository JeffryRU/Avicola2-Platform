import { useState } from 'react'
import { ArrowRight, Download, ExternalLink, Loader2 } from 'lucide-react'
import {
  changeLabel,
  notableChanges,
  previousVersion,
  type AppVersion,
  type VersionCatalog,
} from '@/features/versions/domain/versions'
import { BUILD, useChanges, useCurrentVersion } from '@/features/versions/ui/hooks'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/components/shadcn/dialog'
import { cn } from '@/shared/ui/lib/utils'
import { Segmented } from '@/shared/ui/components/segmented'
import { StatusDot } from '@/shared/ui/components/feedback'
import { Button } from '@/shared/ui/components/shadcn/button'
import { toneOf, longDate } from '@/features/versions/ui/components/version-style'

/** Punto del historial con el que se calculan las novedades de una versión. */
function headOf(v: AppVersion, current: AppVersion | null): string {
  if (!v.moving) return v.ref
  if (current?.id === v.id && BUILD.commit) return BUILD.commit
  return v.branches[0] ?? v.ref
}

export function Highlights({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="grid list-disc gap-1 pl-5 text-base marker:text-muted-foreground">
      {items.map((h) => (
        <li key={h}>{h}</li>
      ))}
    </ul>
  )
}

type Tab = 'versions' | 'news' | 'compare'

export function VersionPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState<Tab>('versions')
  const { catalog, version: current, number } = useCurrentVersion()
  if (!catalog || !current) return null
  const tabs: { value: Tab; label: string }[] = [
    { value: 'versions', label: 'Versiones' },
    { value: 'news', label: 'Novedades' },
    { value: 'compare', label: 'Comparar' },
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Versiones de la app</DialogTitle>
          <DialogDescription>
            Estás en {current.name} · versión {number}. Cada versión se abre aparte, con sus propios datos.
          </DialogDescription>
        </DialogHeader>
        <Segmented value={tab} options={tabs} onChange={setTab} full />
        {tab === 'versions' && <VersionsTab catalog={catalog} current={current} currentNumber={number} />}
        {tab === 'news' && <NewsTab catalog={catalog} current={current} />}
        {tab === 'compare' && <CompareTab catalog={catalog} current={current} currentNumber={number} />}
      </DialogContent>
    </Dialog>
  )
}

function VersionSelect({
  catalog,
  value,
  onChange,
  label,
}: {
  catalog: VersionCatalog
  value: string
  onChange: (id: string) => void
  label: string
}) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-sm font-medium text-ink-2">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-touch w-full min-w-0 rounded-md border-control border-input bg-surface px-3 text-base text-foreground focus-visible:border-ring dsk:h-control"
      >
        {catalog.versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} · v{v.version}
            {v.moving ? ' (en curso)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

function OpenButtons({ version, current }: { version: AppVersion; current: AppVersion }) {
  return (
    <div className="flex flex-wrap gap-2">
      {version.id === current.id ? (
        <span className="dsk:min-h-control inline-flex min-h-touch items-center gap-1.5 text-sm text-muted-foreground">
          <StatusDot tone="ok" /> Estás en esta versión
        </span>
      ) : (
        <Button asChild>
          <a href={version.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> Abrir {version.name}
          </a>
        </Button>
      )}
      {version.apk && (
        <Button asChild variant="outline">
          <a href={version.apk} rel="noopener noreferrer">
            <Download /> App Android
          </a>
        </Button>
      )}
    </div>
  )
}

function VersionCard({
  catalog,
  version,
  number,
  current,
}: {
  catalog: VersionCatalog
  version: AppVersion
  number: string
  current: AppVersion
}) {
  return (
    <div className="grid min-w-0 gap-3 rounded-md border border-border p-4 hc:border-x-0 hc:border-t-heavy hc:border-b-heavy">
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn('mt-2 size-2.5 flex-none rounded-full', toneOf(catalog, version))} />
        <div>
          <b className="block text-lg font-semibold hc:font-extrabold">{version.name}</b>
          <small className="num text-sm text-muted-foreground">
            v{number} · {longDate(version.date)}
            {version.moving ? ' · en curso' : ''}
          </small>
        </div>
      </div>
      <p className="text-base text-ink-2">{version.summary}</p>
      <Highlights items={version.highlights} />
      <OpenButtons version={version} current={current} />
    </div>
  )
}

function VersionsTab({
  catalog,
  current,
  currentNumber,
}: {
  catalog: VersionCatalog
  current: AppVersion
  currentNumber: string
}) {
  const [id, setId] = useState(current.id)
  const version = catalog.versions.find((v) => v.id === id) ?? current
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <VersionSelect catalog={catalog} value={id} onChange={setId} label="Ver la app en" />
      <VersionCard
        catalog={catalog}
        version={version}
        number={version.id === current.id ? currentNumber : version.version}
        current={current}
      />
    </div>
  )
}

function ChangeList({ repo, from, to }: { repo: string; from: string | null; to: string | null }) {
  const q = useChanges(repo, from, to)
  if (!from || !to) return null
  if (q.isPending)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando novedades…
      </p>
    )
  if (q.isError)
    return <p className="text-sm text-muted-foreground">No se pudieron traer las novedades ({q.error.message}).</p>
  const list = notableChanges(q.data)
  if (list.length === 0) return <p className="text-sm text-muted-foreground">Sin cambios registrados.</p>
  const shown = list.slice(0, 60)
  return (
    <ul className="grid gap-1.5 text-base">
      {shown.map((c) => (
        <li key={c.sha} className="flex gap-3">
          <span className="num w-16 flex-none pt-0.5 text-xs text-muted-foreground">
            {c.pr ? `PR #${String(c.pr)}` : c.sha.slice(0, 7)}
          </span>
          <span>{changeLabel(c.title)}</span>
        </li>
      ))}
      {list.length > shown.length && (
        <li className="text-sm text-muted-foreground">y {String(list.length - shown.length)} cambios más</li>
      )}
    </ul>
  )
}

function NewsTab({ catalog, current }: { catalog: VersionCatalog; current: AppVersion }) {
  const [id, setId] = useState(current.id)
  const version = catalog.versions.find((v) => v.id === id) ?? current
  const prev = previousVersion(catalog, version)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <VersionSelect catalog={catalog} value={id} onChange={setId} label="Novedades de" />
      {prev ? (
        <>
          <p className="text-sm text-muted-foreground">
            Lo que cambió desde {prev.name} (v{prev.version}) hasta {version.name}
            {version.moving ? ' hoy' : ` (v${version.version})`}:
          </p>
          <ChangeList repo={catalog.repo} from={prev.ref} to={headOf(version, current)} />
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Es la primera versión. Lo que trajo:</p>
          <Highlights items={version.highlights} />
        </>
      )}
    </div>
  )
}

function CompareTab({
  catalog,
  current,
  currentNumber,
}: {
  catalog: VersionCatalog
  current: AppVersion
  currentNumber: string
}) {
  const numberOf = (v: AppVersion) => (v.id === current.id ? currentNumber : v.version)
  const list = catalog.versions
  const [a, setA] = useState(previousVersion(catalog, current)?.id ?? list[0].id)
  const [b, setB] = useState(current.id)
  const va = list.find((v) => v.id === a) ?? list[0]
  const vb = list.find((v) => v.id === b) ?? current
  // Las novedades siempre van de la más antigua a la más nueva.
  const [older, newer] = list.indexOf(va) <= list.indexOf(vb) ? [va, vb] : [vb, va]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <VersionSelect catalog={catalog} value={a} onChange={setA} label="Versión A" />
        <ArrowRight className="mb-3 size-5 text-muted-foreground" />
        <VersionSelect catalog={catalog} value={b} onChange={setB} label="Versión B" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <VersionCard catalog={catalog} version={va} number={numberOf(va)} current={current} />
        <VersionCard catalog={catalog} version={vb} number={numberOf(vb)} current={current} />
      </div>
      {older.id !== newer.id && (
        <div className="grid gap-2">
          <b className="font-semibold">
            Qué cambió de {older.name} a {newer.name}
          </b>
          <ChangeList repo={catalog.repo} from={older.ref} to={headOf(newer, current)} />
        </div>
      )}
    </div>
  )
}
