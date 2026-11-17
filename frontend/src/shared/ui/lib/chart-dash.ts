/** Trazo de cada ronda anterior de la proyección (hojas 1, 2…): punteada, raya-punto, raya larga (no solo color). */
export const EARLIER_DASH = ['1.5 4', '7 3 1.5 3', '11 4'] as const

/** Color de cada franja apilada (de abajo hacia arriba): Brasa chica, mediana, grande… */
export const PART_COLOR = [
  'var(--chart-part-1)',
  'var(--chart-part-2)',
  'var(--chart-part-3)',
  'var(--chart-part-4)',
] as const

/** Color de cada ronda anterior de la proyección (1, 2, 3): grises, la vigente es la azul. */
export const PREV_COLOR = ['var(--chart-prev-1)', 'var(--chart-prev-2)', 'var(--chart-prev-3)'] as const
