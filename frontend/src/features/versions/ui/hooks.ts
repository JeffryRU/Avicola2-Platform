import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import { liveNumber, versionOfBranch, type AppVersion, type VersionCatalog } from '@/features/versions/domain/versions'

/** Rama y commit de este despliegue (los pone Vercel al compilar). */
export const BUILD = { branch: __APP_BRANCH__, commit: __APP_COMMIT__ }

const NO_POLLING = { refetchInterval: false, retry: false } as const

export function useVersionCatalog() {
  const { versions } = useContainer()
  return useQuery({
    queryKey: queryKeys.versions.catalog,
    queryFn: () => versions.catalog(),
    staleTime: 60 * 60_000,
    ...NO_POLLING,
  })
}

/** La versión de este despliegue y su número (en una versión en curso, calculado con el historial). */
export function useCurrentVersion(): {
  catalog: VersionCatalog | undefined
  version: AppVersion | null
  number: string
} {
  const { versions } = useContainer()
  const { data: catalog } = useVersionCatalog()
  const version = catalog ? versionOfBranch(catalog, BUILD.branch) : null
  const repo = catalog?.repo ?? ''
  const ref = version?.ref ?? ''
  const live = useQuery({
    queryKey: queryKeys.versions.changes(repo, ref, BUILD.commit),
    queryFn: () => versions.changes(repo, ref, BUILD.commit),
    enabled: !!repo && !!ref && !!version?.moving && !!BUILD.commit,
    staleTime: 30 * 60_000,
    ...NO_POLLING,
  })
  const number = !version ? '' : live.data ? liveNumber(version.version, live.data) : version.version
  return { catalog, version, number }
}

/** Cambios entre dos puntos del historial (tags o commits). */
export function useChanges(repo: string, from: string | null, to: string | null) {
  const { versions } = useContainer()
  return useQuery({
    queryKey: queryKeys.versions.changes(repo, from, to),
    queryFn: () => versions.changes(repo, from ?? '', to ?? ''),
    enabled: !!repo && !!from && !!to && from !== to,
    staleTime: 30 * 60_000,
    ...NO_POLLING,
  })
}

/** Abre el panel de versiones desde cualquier parte (chip, franja). Lo provee VersionProvider. */
export const PanelContext = createContext<() => void>(() => undefined)
export const useOpenVersions = () => useContext(PanelContext)
