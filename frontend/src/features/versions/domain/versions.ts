import { z } from 'zod'

/**
 * Versiones publicadas de la app (MVP 1, MVP 2…). El catálogo vive en versions.json: agregar una
 * versión es agregar un renglón. Cada versión tiene su propio despliegue (rama) y su punto en git.
 */
export const appVersionSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Número base de la versión. */
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  /** Punto del historial donde empieza (rama, tag o commit): base para el número y las novedades. */
  ref: z.string(),
  /** Ramas cuyo despliegue es esta versión. */
  branches: z.array(z.string()).default([]),
  /** Sigue recibiendo cambios: su número sube con cada PR y commit. */
  moving: z.boolean().default(false),
  date: z.string(),
  url: z.url(),
  summary: z.string(),
  highlights: z.array(z.string()).default([]),
  apk: z.url().nullable().default(null),
})
export type AppVersion = z.infer<typeof appVersionSchema>

export const versionCatalogSchema = z.object({
  repo: z.string(),
  versions: z.array(appVersionSchema).min(1),
})
export type VersionCatalog = z.infer<typeof versionCatalogSchema>

/** Qué versión es este despliegue: la de su rama o, si no figura (rama de trabajo), la que está en curso. */
export function versionOfBranch(catalog: VersionCatalog, branch: string): AppVersion {
  const list = catalog.versions
  return list.find((v) => v.branches.includes(branch)) ?? list.find((v) => v.moving) ?? list[list.length - 1]
}

/** La versión anterior en el catálogo (para las novedades), o null si es la primera. */
export function previousVersion(catalog: VersionCatalog, version: AppVersion): AppVersion | null {
  const i = catalog.versions.findIndex((v) => v.id === version.id)
  return i > 0 ? catalog.versions[i - 1] : null
}

/** Un cambio del historial: un PR unido o un commit suelto. */
export interface Change {
  sha: string
  title: string
  date: string
  /** Número del PR si el cambio es la unión de un PR. */
  pr: number | null
}

export interface RawCommit {
  sha: string
  commit: { message: string; author: { date: string } | null; committer?: { date: string } | null }
  parents?: { sha: string }[]
}

const MERGE_PR = /^Merge pull request #(\d+)/

/** Commits de GitHub → cambios. De un PR unido se toma su título (lo que va tras la línea en blanco). */
export function toChanges(commits: RawCommit[]): Change[] {
  return commits.map((c) => {
    const [first, ...rest] = c.commit.message.split('\n')
    const pr = MERGE_PR.exec(first)
    const body = rest.join('\n').trim().split('\n')[0]?.trim()
    return {
      sha: c.sha,
      title: pr ? body || first : first.trim(),
      date: c.commit.committer?.date ?? c.commit.author?.date ?? '',
      pr: pr ? Number(pr[1]) : null,
    }
  })
}

/**
 * Número de una versión en curso: el del medio sube con cada PR unido desde su inicio y el último con
 * cada commit suelto después del último PR. 3.0.0 + 2 PR + 1 commit → 3.2.1.
 */
export function liveNumber(base: string, changes: Change[]): string {
  const [major, minor, patch] = base.split('.').map(Number)
  const prs = changes.filter((c) => c.pr !== null)
  if (prs.length === 0) return `${major}.${minor}.${patch + changes.length}`
  const lastPr = prs.reduce((a, b) => (a.date > b.date ? a : b))
  const after = changes.filter((c) => c.pr === null && c.date > lastPr.date).length
  return `${major}.${minor + prs.length}.${after}`
}

/** Para mostrar: sin el prefijo convencional (feat(saca): …) y con mayúscula inicial. */
export function changeLabel(title: string): string {
  const clean = title.replace(/^(feat|fix|refactor|docs|chore|perf|test|style|build|ci)(\([^)]*\))?!?:\s*/i, '')
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

/** Cambios que vale la pena listar como novedades: los PR y los commits que no son uniones. */
export function notableChanges(changes: Change[]): Change[] {
  return changes.filter((c) => c.pr !== null || !c.title.startsWith('Merge ')).reverse()
}
