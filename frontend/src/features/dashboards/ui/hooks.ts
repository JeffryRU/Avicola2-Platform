import { paths } from '@/app/routes'
import { addDays, dShort, type IsoDate } from '@/shared/domain/dates'
import { useSearchParams } from 'react-router'
import { checkPeriod, customPeriod, weekPeriod, type Period } from '@/features/dashboards/domain/period'
import { weekOptions } from '@/features/dashboards/domain/weeks'
import { isoDateSchema } from '@/shared/domain/schemas'
import { dataWindow, useRangeData, useStoreOrders } from '@/features/projections'
import { isSupervisor } from '@/shared/domain/session'
import type { Catalog } from '@/features/catalog'
import { storeEntries, zoneOfStores, zonesOf, type MatrixEntry } from '@/features/dashboards/domain/product-matrix'
import { useRequiredSession } from '@/features/auth'
import { useTeamSellers } from '@/features/sellers'
import { ALL, ALL_PRODUCTS_LABEL, NO_ZONE_LABEL, type FilterChip } from '@/features/dashboards/types/product-detail'

/**
 * Pedidos de las tiendas del período y del anterior (para comparar), como entradas de la tabla.
 * Solo para supervisión y sin filtro de vendedor (las tiendas no son vendedores); `zones` vacía = todas.
 */
export function useStoreEntries(dates: IsoDate[], sellers: readonly string[], zones: readonly string[]): MatrixEntry[] {
  const enabled = isSupervisor(useRequiredSession().seller) && sellers.length === 0 && dates.length > 0
  const from = dates.length ? addDays(dates[0], -dates.length) : ''
  const orders = useStoreOrders(from, dates.at(-1) ?? '', enabled)
  if (!enabled) return []
  const pick = new Set(zones)
  return storeEntries(orders.data ?? [], NO_ZONE_LABEL).filter(
    (e) => pick.size === 0 || pick.has(zoneOfStores(e.seller)),
  )
}

/**
 * Filtros de los dashboards guardados en la URL para poder compartirla:
 * ?semana= o ?desde=&hasta= (rango personalizado), &vendedor=a,b (vacío = todos)&dia=&zona=&tamano=.
 */
export function useDashboardFilters() {
  const [params, setParams] = useSearchParams()
  const weeks = weekOptions()
  const asked = params.get('semana') ?? ''
  const week = weeks.includes(asked) ? asked : weeks[0]
  const sellers = (params.get('vendedor') ?? '').split(',').filter((v) => v && v !== 'all')
  const from = params.get('desde') ?? ''
  const to = params.get('hasta') ?? ''
  const valid = isoDateSchema.safeParse(from).success && isoDateSchema.safeParse(to).success
  const period = valid && !checkPeriod(from, to) ? customPeriod(from, to) : weekPeriod(week)
  /** Cambia varios filtros a la vez (null o '' los quita). Se puede llamar varias veces seguidas. */
  const update = (patch: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )
  }
  return {
    week,
    period,
    sellers,
    param: (key: string) => params.get(key),
    update,
    setWeek: (w: string) => update({ semana: w, desde: null, hasta: null }),
    setCustom: (a: string, b: string) => update({ desde: a, hasta: b }),
    setSellers: (list: string[]) => update({ vendedor: list.join(',') || null }),
  }
}

/** A dónde lleva tocar un día: el vendedor ve su proyección; el supervisor, la de todo el equipo. */
export function useDayPath(): (date: string) => string {
  return isSupervisor(useRequiredSession().seller) ? paths.teamDay : paths.day
}

/** Lista de un parámetro separado por comas ("a,b"); vacía = todos. */
const listParam = (value: string | null) => (value ?? '').split(',').filter((v) => v && v !== ALL)

/** Filtros propios de «Detalle por producto» (?dia=a,b&zona=a,b&tamano=), sin validar: la tabla los ajusta. */
export function useDetailFilters() {
  const { param, update } = useDashboardFilters()
  return {
    days: listParam(param('dia')),
    zones: listParam(param('zona')),
    sizes: listParam(param('tamano')),
    setDays: (list: string[]) => update({ dia: list.join(',') || null }),
    setZones: (list: string[]) => update({ zona: list.join(',') || null }),
    setSizes: (list: string[]) => update({ tamano: list.join(',') || null }),
  }
}

/** Clave de una opción de «Tamaño»: "BRASA|" (todas) o "BRASA|Brasa chica". */
export const choiceKey = (category: string, subcategory: string | null) => `${category}|${subcategory ?? ''}`

/** Filtros de la tabla ya validados contra la semana, el catálogo y las zonas, con sus etiquetas. */
export function useDetailSelection(dates: IsoDate[], catalog: Catalog | null | undefined) {
  const f = useDetailFilters()
  const team = useTeamSellers()
  const weekDays = dates
  const allZones = zonesOf(team, NO_ZONE_LABEL)
  // En el orden de la semana / alfabético, sin valores que ya no existen.
  const days = weekDays.filter((d) => f.days.includes(d))
  const zones = allZones.filter((z) => f.zones.includes(z))
  const choices = catalog?.choices ?? []
  // «Todas las brasas» (o «Todos los productos») es no elegir ninguno; las opciones marcables son los
  // tamaños y las categorías sin tamaños (el pollo sin menudencia).
  const allSizes = choices.at(0)
  const several = (catalog?.categories.length ?? 0) > 1
  const sizeOptions = choices.filter(
    (c) => c.subcategory !== null || (catalog?.subcategories(c.category).length ?? 0) === 0,
  )
  const sizes = sizeOptions.filter((c) => f.sizes.includes(choiceKey(c.category, c.subcategory)))
  const products = !catalog
    ? []
    : sizes.length
      ? catalog.products.filter((p) => sizes.some((c) => c.category === p.category && c.subcategory === p.subcategory))
      : catalog.products
  const chips: FilterChip[] = [
    ...(days.length ? [{ key: 'dia', label: days.map(dShort).join(', '), onClear: () => f.setDays([]) }] : []),
    ...(zones.length ? [{ key: 'zona', label: zones.join(', '), onClear: () => f.setZones([]) }] : []),
    ...(sizes.length
      ? [{ key: 'tamano', label: sizes.map((c) => c.label).join(', '), onClear: () => f.setSizes([]) }]
      : []),
  ]
  return {
    ...f,
    team,
    weekDays,
    allZones,
    days,
    zones,
    allSizesLabel: several ? ALL_PRODUCTS_LABEL : (allSizes?.label ?? ''),
    sizeOptions,
    selectedSizes: sizes,
    products,
    chips,
  }
}

/** Datos del período y de los mismos días justo antes (para las variaciones). */
export function usePeriodData(period: Period) {
  const w = dataWindow()
  const prevFrom = addDays(period.from, -period.dates.length)
  // Un período antiguo (p. ej. la historia de ARIS) pide solo sus días, no hasta hoy. Si no,
  // sin salir de la ventana habitual comparte su caché y un rango más antiguo pide lo que falta.
  const old = period.to < w.from
  const from = old || prevFrom < w.from ? prevFrom : w.from
  const to = old ? period.to : period.to > w.to ? period.to : w.to
  return useRangeData(from, to)
}
