import type { VersionsGateway } from '@/features/versions/application/ports'
import {
  toChanges,
  versionCatalogSchema,
  type Change,
  type RawCommit,
  type VersionCatalog,
} from '@/features/versions/domain/versions'

const REPO = 'JeffryRU/Avicola2-Platform'
/** El catálogo se lee de develop: así todas las versiones publicadas ven las mismas versiones. */
const CATALOG_URLS = [
  `https://raw.githubusercontent.com/${REPO}/develop/frontend/public/versions.json`,
  '/versions.json',
]
const CACHE_PREFIX = 'nv_versions:'
/** La API sin token admite 60 consultas por hora: se guarda lo leído un rato. */
const TTL_MS = 30 * 60_000

function cached(key: string): Change[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const { at, value } = JSON.parse(raw) as { at: number; value: Change[] }
    return Date.now() - at < TTL_MS ? value : null
  } catch {
    return null
  }
}

function remember(key: string, value: Change[]) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), value }))
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

/** Catálogo desde versions.json y novedades desde la API pública de GitHub (sin token). */
export class GithubVersionsGateway implements VersionsGateway {
  async catalog(): Promise<VersionCatalog> {
    for (const url of CATALOG_URLS) {
      try {
        const res = await fetch(url, { cache: 'no-cache' })
        if (!res.ok) continue
        const parsed = versionCatalogSchema.safeParse(await res.json())
        if (parsed.success) return parsed.data
      } catch {
        /* se prueba la siguiente fuente */
      }
    }
    throw new Error('No se pudo leer la lista de versiones.')
  }

  async changes(repo: string, from: string, to: string): Promise<Change[]> {
    const key = `${repo}:${from}...${to}`
    const hit = cached(key)
    if (hit) return hit
    const res = await fetch(`https://api.github.com/repos/${repo}/compare/${from}...${to}?per_page=250`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new Error(`GitHub respondió ${String(res.status)} al pedir las novedades.`)
    const body = (await res.json()) as { commits?: RawCommit[] }
    const changes = toChanges(body.commits ?? [])
    remember(key, changes)
    return changes
  }
}
