/** Formatos numéricos en es-PE, como en el mockup. */
export const nf0 = (n: number) => Math.round(n).toLocaleString('es-PE')

export const nf1 = (n: number) =>
  (Math.round(n * 10) / 10).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const pct1 = (n: number) => `${n > 0 ? '+' : ''}${nf1(n)}%`

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
