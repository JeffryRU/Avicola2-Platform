import { describe, expect, it } from 'vitest'
import catalogText from '@/../public/versions.json?raw'
import {
  changeLabel,
  isLatest,
  liveNumber,
  notableChanges,
  previousVersion,
  toChanges,
  versionCatalogSchema,
  versionOfBranch,
  type Change,
  type RawCommit,
} from '@/features/versions/domain/versions'

const catalog = versionCatalogSchema.parse(JSON.parse(catalogText))

const commit = (message: string, date: string, sha = message.slice(0, 7)): RawCommit => ({
  sha,
  commit: { message, author: { date }, committer: { date } },
})
const pr = (n: number, title: string, date: string) =>
  commit(`Merge pull request #${String(n)} from JeffryRU/develop-6xp0z4\n\n${title}`, date, `pr${String(n)}`)

describe('versiones', () => {
  it('solo la última versión cuenta como la actual (sin franja ni aviso por su cuenta)', () => {
    const [mvp1, mvp2, mvp3] = catalog.versions
    expect([mvp1, mvp2, mvp3].map((v) => isLatest(catalog, v))).toEqual([false, false, true])
  })

  it('el catálogo publicado es válido y va de la más antigua a la más nueva', () => {
    expect(catalog.versions.map((v) => v.id)).toEqual(['mvp1', 'mvp2', 'mvp3'])
    expect(catalog.versions.map((v) => v.version)).toEqual(['1.0.0', '2.0.0', '3.0.0'])
    expect(catalog.versions.filter((v) => v.moving)).toHaveLength(1)
  })

  it('cada despliegue sabe qué versión es por su rama', () => {
    expect(versionOfBranch(catalog, 'mvp1').id).toBe('mvp1')
    expect(versionOfBranch(catalog, 'mvp2').id).toBe('mvp2')
    expect(versionOfBranch(catalog, 'develop').id).toBe('mvp3')
    // Una rama de trabajo es la versión en curso.
    expect(versionOfBranch(catalog, 'develop-6xp0z4').id).toBe('mvp3')
    expect(previousVersion(catalog, catalog.versions[1])?.id).toBe('mvp1')
    expect(previousVersion(catalog, catalog.versions[0])).toBeNull()
  })

  it('el número sube con cada PR (medio) y con cada commit suelto después del último PR (último)', () => {
    const changes = toChanges([
      commit('feat: algo dentro del PR', '2026-11-13T10:00:00Z'),
      pr(13, 'Las pantallas se ven sin backend', '2026-11-14T17:30:00Z'),
      pr(14, 'App móvil sin backend', '2026-11-14T21:49:00Z'),
      commit('fix: ajuste suelto', '2026-11-15T09:00:00Z'),
    ])
    expect(liveNumber('3.0.0', changes)).toBe('3.2.1')
    expect(liveNumber('3.0.0', [])).toBe('3.0.0')
    // Sin PR, cada commit sube el último número.
    expect(liveNumber('3.0.0', toChanges([commit('fix: a', '2026-11-15T09:00:00Z')]))).toBe('3.0.1')
  })

  it('de un PR unido se muestra su título; las novedades van de la más nueva a la más antigua', () => {
    const changes: Change[] = toChanges([
      commit('feat(saca): nueva regla', '2026-11-12T18:30:00Z'),
      commit('Merge branch develop', '2026-11-12T19:00:00Z'),
      pr(15, 'Quita el cambio de contraseña obligatorio', '2026-11-14T22:50:00Z'),
    ])
    const notable = notableChanges(changes)
    expect(notable.map((c) => c.pr)).toEqual([15, null])
    expect(notable[0].title).toBe('Quita el cambio de contraseña obligatorio')
    expect(changeLabel(notable[1].title)).toBe('Nueva regla')
  })
})
