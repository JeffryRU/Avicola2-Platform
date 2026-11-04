import { useQuery } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { paths } from '@/app/routes'
import { addDays, dShort, type IsoDate } from '@/shared/domain/dates'
import type { Period } from '@/features/dashboards/domain/period'
import { dataWindow, useRangeData } from '@/features/projections/ui/hooks'
import { isSupervisor } from '@/features/auth/domain/session'
import type { Catalog } from '@/features/catalog/domain/catalog'
import { zonesOf } from '@/features/dashboards/domain/product-matrix'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { useDashboardFilters } from '@/features/dashboards/ui/components/dashboard'
import { ALL, NO_ZONE_LABEL, type FilterChip } from '@/features/dashboards/types/product-detail'

export function useSellers() {
  const { sellers } = useContainer()
  return useQuery({ queryKey: ['sellers'], queryFn: () => sellers.sellers(), staleTime: 10 * 60_000 })
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

/** Marca o desmarca un valor de una lista. */
export const toggleIn = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

/** Filtros de la tabla ya validados contra la semana, el catálogo y las zonas, con sus etiquetas. */
export function useDetailSelection(dates: IsoDate[], catalog: Catalog | null | undefined) {
  const f = useDetailFilters()
  const team = (useSellers().data ?? []).filter((s) => !isSupervisor(s))
  const weekDays = dates
  const allZones = zonesOf(team, NO_ZONE_LABEL)
  // En el orden de la semana / alfabético, sin valores que ya no existen.
  const days = weekDays.filter((d) => f.days.includes(d))
  const zones = allZones.filter((z) => f.zones.includes(z))
  const choices = catalog?.choices ?? []
  // «Todas las brasas» es no elegir ninguno; las opciones marcables son los tamaños.
  const allSizes = choices.at(0)
  const sizeOptions = choices.filter((c) => c.subcategory !== null)
  const sizes = sizeOptions.filter((c) => f.sizes.includes(choiceKey(c.category, c.subcategory)))
  const products = !catalog
    ? []
    : sizes.length
      ? catalog.products.filter((p) => sizes.some((c) => c.category === p.category && c.subcategory === p.subcategory))
      : allSizes
        ? catalog.selected(allSizes)
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
    allSizesLabel: allSizes?.label ?? '',
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
  // Sin salir de la ventana habitual comparte su caché; un rango más antiguo pide lo que falta.
  return useRangeData(prevFrom < w.from ? prevFrom : w.from, period.to > w.to ? period.to : w.to)
}
