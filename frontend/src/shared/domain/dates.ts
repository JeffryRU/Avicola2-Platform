/** Fechas como texto ISO (AAAA-MM-DD) en hora local: sin desfases de zona horaria. */
export type IsoDate = string

const DAY_MS = 86_400_000
export const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const pad = (n: number) => String(n).padStart(2, '0')

export const toIso = (d: Date): IsoDate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function fromIso(s: IsoDate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const today = (): IsoDate => toIso(new Date())

export function addDays(s: IsoDate, n: number): IsoDate {
  const d = fromIso(s)
  d.setDate(d.getDate() + n)
  return toIso(d)
}

export const diffDays = (a: IsoDate, b: IsoDate) => Math.round((fromIso(a).getTime() - fromIso(b).getTime()) / DAY_MS)

/** Lunes de la semana de la fecha. */
export function weekStart(s: IsoDate): IsoDate {
  const d = fromIso(s)
  return addDays(s, -((d.getDay() + 6) % 7))
}

export const weekDates = (ws: IsoDate): IsoDate[] => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(ws, i))
export const rangeDates = (start: IsoDate, days: number): IsoDate[] =>
  Array.from({ length: days }, (_, i) => addDays(start, i))
/** Índice lunes=0 … domingo=6. */
export const weekdayIndex = (s: IsoDate) => (fromIso(s).getDay() + 6) % 7

export const dDow = (s: IsoDate) => DOW[fromIso(s).getDay()]
export const dDowLong = (s: IsoDate) => DOW_LONG[fromIso(s).getDay()]
export function dDM(s: IsoDate) {
  const d = fromIso(s)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}
export const dShort = (s: IsoDate) => `${dDow(s)} ${dDM(s)}`
export function dFull(s: IsoDate) {
  const d = fromIso(s)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function weekLabel(ws: IsoDate, long = false): string {
  const a = fromIso(ws)
  const b = fromIso(addDays(ws, 6))
  const names = long ? MONTHS_LONG : MONTHS
  const de = long ? ' de ' : ' '
  const tail = `${b.getDate()}${de}${names[b.getMonth()]}${de}${b.getFullYear()}`
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} - ${tail}`
    : `${a.getDate()}${de}${names[a.getMonth()]} - ${tail}`
}

export function relativeDay(s: IsoDate, ref: IsoDate = today()): string | null {
  const n = diffDays(s, ref)
  return ({ 0: 'Hoy', 1: 'Mañana', 2: 'Pasado mañana', [-1]: 'Ayer' } as Record<number, string>)[n] ?? null
}

/** "Hoy, mañana y pasado mañana." o "Del Lun 03/11 al Vie 07/11." */
export function daysText(dates: IsoDate[], ref: IsoDate = today()): string {
  const rel = dates.map((d) => relativeDay(d, ref))
  const known = rel.filter((r): r is string => r !== null)
  if (known.length === rel.length) {
    const words = known.map((r, i) => (i ? r.toLowerCase() : r))
    return `${words.length > 1 ? `${words.slice(0, -1).join(', ')} y ${words.at(-1)}` : words[0]}.`
  }
  return `Del ${dShort(dates[0])} al ${dShort(dates[dates.length - 1])}.`
}

/** "08:05" → "08:05 a. m." */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${pad(h % 12 || 12)}:${pad(m)} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

export function greeting(hour = new Date().getHours()): string {
  return hour < 12 ? '¡Buenos días' : hour < 19 ? '¡Buenas tardes' : '¡Buenas noches'
}

/** Hora local "HH:MM" de un instante ISO. */
export const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
