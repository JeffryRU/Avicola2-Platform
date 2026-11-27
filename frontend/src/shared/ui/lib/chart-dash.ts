/** Trazo de cada ronda anterior de la proyección (hojas 1, 2, 3): lo pone globals.css (--dash-chart-prev-N). */
export const EARLIER_DASH = [
  'var(--dash-chart-prev-1)',
  'var(--dash-chart-prev-2)',
  'var(--dash-chart-prev-3)',
] as const

/** Color de cada franja apilada (de abajo hacia arriba): Brasa chica, mediana, grande… */
export const PART_COLOR = [
  'var(--chart-part-1)',
  'var(--chart-part-2)',
  'var(--chart-part-3)',
  'var(--chart-part-4)',
] as const

/** Color de cada ronda anterior de la proyección (1, 2, 3): pizarra, cian y vino (la vigente, el principal). */
export const PREV_COLOR = ['var(--chart-prev-1)', 'var(--chart-prev-2)', 'var(--chart-prev-3)'] as const
