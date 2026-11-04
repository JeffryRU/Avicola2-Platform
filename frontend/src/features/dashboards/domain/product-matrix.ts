import type { IsoDate } from '@/shared/domain/dates'
import type { Seller } from '@/features/auth/domain/session'
import { bySubcategory } from '@/features/catalog/domain/catalog'
import type { Product } from '@/features/catalog/domain/schemas'
import { CONFIRMED, type Projection } from '@/features/projections/domain/schemas'

/** Una columna de la tabla: qué proyecciones suma y bajo qué encabezado agrupado va. */
export interface MatrixColumn {
  key: string
  label: string
  group: string | null
  match: (p: Projection) => boolean
}

export interface MatrixRow {
  product: Product
  cells: number[]
  total: number
  kg: number
}

/** Tabla producto × columna (vendedores por zona o días), con filas agrupadas por tamaño. */
export interface ProductMatrix {
  columns: MatrixColumn[]
  /** Encabezado superior: grupos consecutivos de columnas (p. ej. zonas). */
  headerGroups: { name: string | null; span: number }[]
  groups: { name: string | null; rows: MatrixRow[] }[]
  cells: number[]
  total: number
  kg: number
}

/** Suma las proyecciones confirmadas de cada producto en cada columna. */
export function productMatrix(columns: MatrixColumn[], products: Product[], projections: Projection[]): ProductMatrix {
  const confirmed = projections.filter((p) => p.status === CONFIRMED)
  const perColumn = columns.map((c) => confirmed.filter(c.match))
  const row = (product: Product): MatrixRow => {
    const cells = perColumn.map((list) => list.reduce((s, p) => s + (p.units[product.id] ?? 0), 0))
    const total = cells.reduce((a, b) => a + b, 0)
    return { product, cells, total, kg: total * product.kg_per_unit }
  }
  const groups = bySubcategory(products).map((g) => ({ name: g.name, rows: g.products.map(row) }))
  const rows = groups.flatMap((g) => g.rows)
  const headerGroups: ProductMatrix['headerGroups'] = []
  for (const c of columns) {
    const last = headerGroups.at(-1)
    if (last?.name === c.group) last.span++
    else headerGroups.push({ name: c.group, span: 1 })
  }
  return {
    columns,
    headerGroups,
    groups,
    cells: columns.map((_, i) => rows.reduce((s, r) => s + r.cells[i], 0)),
    total: rows.reduce((s, r) => s + r.total, 0),
    kg: rows.reduce((s, r) => s + r.kg, 0),
  }
}

/** Una columna por vendedor, agrupadas por zona (zonas y nombres en orden alfabético). `zones` vacía = todas. */
export function sellerColumns(
  sellers: Seller[],
  dates: IsoDate[],
  noZone: string,
  zones: readonly string[] = [],
): MatrixColumn[] {
  const days = new Set(dates)
  const pick = new Set(zones)
  return sellers
    .filter((s) => pick.size === 0 || pick.has(s.zone ?? noZone))
    .sort((a, b) => (a.zone ?? noZone).localeCompare(b.zone ?? noZone) || a.name.localeCompare(b.name))
    .map((s) => ({
      key: s.username,
      label: s.name,
      group: s.zone ?? noZone,
      match: (p) => p.seller === s.username && days.has(p.date),
    }))
}

/** Una columna por día, para un vendedor o para todos (`seller` = null). */
export function dayColumns(dates: IsoDate[], seller: string | null, label: (d: IsoDate) => string): MatrixColumn[] {
  return dates.map((d) => ({
    key: d,
    label: label(d),
    group: null,
    match: (p) => p.date === d && (!seller || p.seller === seller),
  }))
}

/** Zonas presentes en el equipo, en orden alfabético. */
export const zonesOf = (sellers: Seller[], noZone: string) =>
  [...new Set(sellers.map((s) => s.zone ?? noZone))].sort((a, b) => a.localeCompare(b))
