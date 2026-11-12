import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useContainer } from '@/app/di'
import { Catalog } from '@/features/catalog/domain/catalog'
import { DEFAULT_PRODUCTS } from '@/features/catalog/domain/defaults'
import { productSchema } from '@/features/catalog/domain/schemas'

const CACHE_KEY = 'nv_catalog_cache'

/**
 * Catálogo de productos. Mientras el servidor no responde se usa el último recibido en este
 * equipo o, si nunca llegó, el de respaldo: así las pantallas se dibujan igual. `fromServer`
 * dice si lo que se muestra ya es el del servidor.
 */
export function useCatalog() {
  const { catalog: gateway, preferences } = useContainer()
  const q = useQuery({ queryKey: ['catalog'], queryFn: () => gateway.catalog(), staleTime: 10 * 60_000 })
  useEffect(() => {
    if (q.data) preferences.set(CACHE_KEY, q.data)
  }, [q.data, preferences])
  const products = useMemo(
    () => q.data ?? preferences.get(CACHE_KEY, z.array(productSchema)) ?? DEFAULT_PRODUCTS,
    [q.data, preferences],
  )
  const catalog = useMemo(() => new Catalog(products), [products])
  return { ...q, catalog, fromServer: !!q.data }
}
