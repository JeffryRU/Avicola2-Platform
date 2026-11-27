import type { AppVersion, VersionCatalog } from '@/features/versions/domain/versions'

/** Un punto de color por versión, en el orden del catálogo (solo distingue; el nombre va al lado). */
export const TONES = ['bg-chart-1', 'bg-chart-2', 'bg-ok', 'bg-warn', 'bg-draft']
export const toneOf = (catalog: VersionCatalog | undefined, v: AppVersion | null) =>
  TONES[Math.max(0, catalog?.versions.findIndex((x) => x.id === v?.id) ?? 0) % TONES.length]

export const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
