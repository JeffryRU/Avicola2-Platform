import type { AppVersion, VersionCatalog } from '@/features/versions/domain/versions'

/** Un color por versión, en el orden del catálogo. */
export const TONES = ['bg-sky-700', 'bg-violet-700', 'bg-emerald-700', 'bg-amber-700', 'bg-rose-700']
export const toneOf = (catalog: VersionCatalog | undefined, v: AppVersion | null) =>
  TONES[Math.max(0, catalog?.versions.findIndex((x) => x.id === v?.id) ?? 0) % TONES.length]

export const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
