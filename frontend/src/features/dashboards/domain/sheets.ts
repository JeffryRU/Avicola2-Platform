import type { IsoDate } from '@/shared/domain/dates'
import type { Units } from '@/shared/domain/products'
import type { Catalog } from '@/features/catalog'
import type { ProjectionChange } from '@/features/history'
import type { Projection } from '@/features/projections'

/**
 * Proyección por ronda de hojas (INS-06): un vendedor puede registrar el mismo día 2 o 3 veces;
 * cada registro es una hoja nueva que corrige a la anterior. La ronda k de un día suma, de cada
 * vendedor, su hoja k (o la última que tenga, si registró menos veces). Así la ronda 1 es lo que
 * se proyectó primero y la última ronda es la proyección vigente.
 */
export interface SheetRounds {
  /** Cuántas rondas hay en el período (1 si nadie volvió a registrar). */
  rounds: number
  /** kg de cada ronda por día: `kg[fecha][k - 1]`. */
  kg: Record<IsoDate, number[]>
}

export function sheetRounds(
  dates: IsoDate[],
  sellers: readonly string[], // vacía = todos
  projections: Projection[],
  changes: ProjectionChange[],
  catalog: Catalog,
): SheetRounds {
  const inDates = new Set(dates)
  const picked = (seller: string) => !sellers.length || sellers.includes(seller)
  const key = (seller: string, date: IsoDate, category: string) => `${seller}|${date}|${category}`
  // Hojas de cada vendedor, día y categoría, en orden (del historial).
  const sheets = new Map<string, { sheet: number; at: string; units: Units }[]>()
  for (const c of changes) {
    if (!inDates.has(c.date) || !picked(c.seller)) continue
    const k = key(c.seller, c.date, c.category)
    sheets.set(k, [...(sheets.get(k) ?? []), { sheet: c.sheet ?? 0, at: c.changed_at, units: c.after }])
  }
  // Por cada proyección vigente: sus hojas en orden; la última siempre es la vigente.
  const groups: { date: IsoDate; list: Units[] }[] = []
  for (const p of projections) {
    if (p.status !== 'confirmed' || !inDates.has(p.date) || !picked(p.seller)) continue
    const found = (sheets.get(key(p.seller, p.date, p.category)) ?? [])
      .sort((a, b) => a.sheet - b.sheet || a.at.localeCompare(b.at))
      .map((s) => s.units)
    const last = found.at(-1)
    const same = last && JSON.stringify(sorted(last)) === JSON.stringify(sorted(p.units))
    groups.push({ date: p.date, list: same ? found : [...found, p.units] })
  }
  const rounds = Math.max(1, ...groups.map((g) => g.list.length))
  const kg: Record<IsoDate, number[]> = {}
  for (const d of dates) kg[d] = Array.from({ length: rounds }, () => 0)
  for (const g of groups) {
    for (let r = 0; r < rounds; r++) kg[g.date][r] += catalog.kg(g.list[Math.min(r, g.list.length - 1)])
  }
  return { rounds, kg }
}

const sorted = (u: Units) =>
  Object.entries(u)
    .filter(([, n]) => n)
    .sort(([a], [b]) => a.localeCompare(b))
