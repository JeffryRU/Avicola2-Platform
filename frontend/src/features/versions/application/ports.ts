import type { Change, VersionCatalog } from '@/features/versions/domain/versions'

/** Lee el catálogo de versiones y el historial de cambios del repositorio. */
export interface VersionsGateway {
  catalog(): Promise<VersionCatalog>
  /** Cambios entre dos puntos del historial (tags o commits), del más antiguo al más nuevo. */
  changes(repo: string, from: string, to: string): Promise<Change[]>
}
