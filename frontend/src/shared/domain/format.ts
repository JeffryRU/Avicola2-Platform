/** Formatos numéricos en es-PE, como en el mockup. */
export const nf0 = (n: number) => Math.round(n).toLocaleString('es-PE')

export const nf1 = (n: number) =>
  (Math.round(n * 10) / 10).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const pct1 = (n: number) => `${n > 0 ? '+' : ''}${nf1(n)}%`

/** "  Ana   Torres " → "Ana Torres": sin espacios al borde ni repetidos (nombres y motivos). */
export const collapseSpaces = (text: string) => text.split(/\s+/).filter(Boolean).join(' ')

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

/** Lo que se deja escribir en un campo numérico: solo dígitos, como mucho `maxDigits`. */
export const keepDigits = (raw: string, maxDigits: number) => raw.replace(/\D/g, '').slice(0, maxDigits)

/** Lee un número escrito a mano: se ignora todo lo que no es dígito y se toman los primeros `maxDigits`. Vacío = sin dato. */
export function parseDigits(raw: string, maxDigits: number): number | null {
  const digits = keepDigits(raw, maxDigits)
  return digits === '' ? null : Number(digits)
}

/** Celda de proyección: hasta 5 dígitos (99,999 unidades, MAX_UNITS de projections/domain/draft.ts). */
export const CELL_MAX_DIGITS = 5
export const parseCell = (raw: string): number | null => parseDigits(raw, CELL_MAX_DIGITS)

/** Stock, producción y pedidos a granja: hasta 7 dígitos y nunca más de RECORD_MAX_UNITS. */
export const RECORD_MAX_DIGITS = 7
export const RECORD_MAX_UNITS = 1_000_000

export function parseUnits(raw: string): number | null {
  const n = parseDigits(raw, RECORD_MAX_DIGITS)
  return n === null ? null : Math.min(n, RECORD_MAX_UNITS)
}

/** Redondeo a 2 decimales (kg en exportaciones y totales). */
export const round2 = (n: number) => Math.round(n * 100) / 100

/** Marca o desmarca un valor de una lista (filtros con casillas). */
export const toggleIn = <T>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
