import type { IsoDate } from '@/shared/domain/dates'
import type { Seller } from '@/features/auth/domain/session'
import { addUnits, sumUnits, type Catalog } from '@/features/catalog/domain/catalog'
import type { Units } from '@/features/catalog/domain/schemas'
import { CONFIRMED, type DailyUnits, type Projection } from '@/features/projections/domain/schemas'

/** Un vendedor en el día: lo que proyectó (todas sus categorías) y su venta real, si ya llegó. */
export interface SellerDay {
  seller: Seller
  confirmed: boolean
  category: string | null
  units: Units
  u: number
  kg: number
  submittedAt: string | null
  real: Units | null
  realKg: number | null
}

/** Vista del supervisor de un día: cada vendedor y el total del equipo. */
export interface TeamDay {
  date: IsoDate
  rows: SellerDay[]
  confirmed: number
  units: Units
  u: number
  kg: number
  real: Units | null
  realKg: number | null
}

export function teamDay(
  date: IsoDate,
  sellers: Seller[],
  projections: Projection[],
  sales: DailyUnits[],
  catalog: Catalog,
): TeamDay {
  const rows = sellers.map((seller): SellerDay => {
    const mine = projections.filter((p) => p.date === date && p.seller === seller.username && p.status === CONFIRMED)
    const units = mine.reduce<Units>((acc, p) => addUnits(acc, p.units), {})
    const sold = sales.filter((s) => s.date === date && s.seller === seller.username)
    const real = sold.length ? sold.reduce<Units>((acc, s) => addUnits(acc, s.units), {}) : null
    const last =
      mine
        .map((p) => p.submitted_at)
        .sort()
        .at(-1) ?? null
    return {
      seller,
      confirmed: mine.length > 0,
      category: mine[0]?.category ?? null,
      units,
      u: sumUnits(units),
      kg: catalog.kg(units),
      submittedAt: last,
      real,
      realKg: real ? catalog.kg(real) : null,
    }
  })
  // Primero quienes ya confirmaron (más unidades arriba); luego los pendientes, por nombre.
  rows.sort(
    (a, b) => Number(b.confirmed) - Number(a.confirmed) || b.u - a.u || a.seller.name.localeCompare(b.seller.name),
  )
  const units = rows.reduce<Units>((acc, r) => addUnits(acc, r.units), {})
  const withReal = rows.filter((r) => r.real)
  const real = withReal.length ? withReal.reduce<Units>((acc, r) => addUnits(acc, r.real ?? {}), {}) : null
  return {
    date,
    rows,
    confirmed: rows.filter((r) => r.confirmed).length,
    units,
    u: sumUnits(units),
    kg: catalog.kg(units),
    real,
    realKg: real ? catalog.kg(real) : null,
  }
}
