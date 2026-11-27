/** Marcas de la app: nombre y lema en pantalla (única fuente). */
export const BRAND_IDS = ['noraves', 'rocio'] as const
export type BrandId = (typeof BRAND_IDS)[number]
export const DEFAULT_BRAND: BrandId = 'noraves'

export const BRANDS: Record<BrandId, { name: string; tag: string }> = {
  noraves: { name: 'Noraves', tag: 'Proyección inteligente para una mejor producción' },
  rocio: { name: 'Grupo Rocío', tag: 'Transformamos realidades para mejorar vidas' },
}
