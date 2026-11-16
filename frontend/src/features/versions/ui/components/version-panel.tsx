import { useState, type ReactNode } from 'react'
import { ArrowRight, Download, ExternalLink, GitCompare, History, Layers, Loader2, Sparkles } from 'lucide-react'
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
    <ul className="grid gap-1.5 text-[14px]">
      {items.map((h) => (
        <li key={h} className="flex gap-2">
          <Sparkles className="mt-0.5 size-4 flex-none text-primary" />
          <span>{h}</span>
        </li>
      ))}
    </ul>
  )
}

type Tab = 'versions' | 'news' | 'compare'

export function VersionPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState<Tab>('versions')
  const { catalog, version: current, number } = useCurrentVersion()
  if (!catalog || !current) return null
  const tabs: [Tab, string, ReactNode][] = [
    ['versions', 'Versiones', <Layers key="v" />],
    ['news', 'Novedades', <History key="n" />],
    ['compare', 'Comparar', <GitCompare key="c" />],
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
        <div className="flex gap-1 rounded-xl bg-secondary p-1" role="tablist">
          {tabs.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold [&_svg]:size-4',
                tab === id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground',
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
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
    <label className="grid gap-1.5">
      <span className="text-[12px] font-bold tracking-[0.04em] text-muted-foreground uppercase">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-[10px] border-[1.5px] border-border bg-white px-3 text-[15px] font-semibold outline-none focus:border-primary"
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
        <span className="inline-flex h-10 items-center rounded-xl bg-secondary px-4 text-sm font-bold text-primary">
          Estás en esta versión
        </span>
      ) : (
        <a
          href={version.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          <ExternalLink className="size-4" /> Abrir {version.name}
        </a>
      )}
      {version.apk && (
        <a
          href={version.apk}
          className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-bold"
          rel="noopener noreferrer"
        >
          <Download className="size-4" /> App Android
        </a>
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
    <div className="grid gap-3 rounded-2xl border p-4">
      <div className="flex items-center gap-3">
        <span
          className={cn('grid size-11 flex-none place-items-center rounded-xl text-white', toneOf(catalog, version))}
        >
          <Layers className="size-5" />
        </span>
        <div>
          <b className="block text-lg leading-tight">{version.name}</b>
          <small className="text-muted-foreground">
            v{number} · {longDate(version.date)}
            {version.moving ? ' · en curso' : ''}
          </small>
        </div>
      </div>
      <p className="text-[14px] text-ink-2">{version.summary}</p>
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
    <div className="grid gap-4">
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
    <ul className="grid gap-1.5 text-[14px]">
      {shown.map((c) => (
        <li key={c.sha} className="flex gap-2">
          <span
            className={cn(
              'mt-0.5 h-5 flex-none rounded-md px-1.5 text-[11px] leading-5 font-bold',
              c.pr ? 'bg-secondary text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
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
    <div className="grid gap-4">
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
    <div className="grid gap-4">
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
          <b>
            Qué cambió de {older.name} a {newer.name}
          </b>
          <ChangeList repo={catalog.repo} from={older.ref} to={headOf(newer, current)} />
        </div>
      )}
    </div>
  )
}
