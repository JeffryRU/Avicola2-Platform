/**
 * Vocabulario del catálogo: tipos de la selección de productos y cómo se nombran en pantalla.
 * Es la única fuente de estos textos; las pantallas los obtienen a través de `Catalog`.
 */

/** Qué se proyecta: una categoría entera (`subcategory: null`) o uno de sus tamaños. */
export interface ProductSelection {
  category: string
  subcategory: string | null
}

/** Opción del selector «Categoría» en Registrar. */
export interface ProductChoice extends ProductSelection {
  label: string
}

/** "BRASA" → "Todas las brasas". */
export function allOfLabel(category: string): string {
  const name = category.toLowerCase()
  return `Todas las ${name.endsWith('s') ? name : `${name}s`}`
}

/** "Brasa chica" dentro de BRASA → "chica" (para listar tamaños sin repetir la categoría). */
export function shortSizeLabel(category: string, subcategory: string): string {
  return subcategory.replace(new RegExp(`^${category}\\s+`, 'i'), '')
}

/** ["chica", "mediana", "grande"] → "chica, mediana y grande". */
export function joinLabels(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? '')
}

/** Peso por unidad tal como se muestra junto a cada producto: "1.20 kg/unidad". */
export const kgPerUnitLabel = (kg: number) => `${kg.toFixed(2)} kg/unidad`

/** Nombre de la categoría para mostrar: "BRASA" → "Brasa"; las que ya vienen escritas se dejan. */
export const categoryName = (category: string) =>
  category === category.toUpperCase() ? category.charAt(0) + category.slice(1).toLowerCase() : category

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
