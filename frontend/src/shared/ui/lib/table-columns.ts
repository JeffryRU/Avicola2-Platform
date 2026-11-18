import type { ReactNode } from 'react'
import { nf0, nf1, pct1 } from '@/shared/domain/format'
import type { Column } from '@/shared/ui/components/data-table'
import type { CellTone } from '@/shared/ui/lib/table-styles'

/**
 * Columnas listas para las tablas: cada módulo dice qué valor va y la columna pone el formato, el
 * «—» de lo vacío, el atenuado de los ceros y el tono. Un formato se cambia aquí para todo el sistema.
 */

type Value<T> = (row: T) => number | null | undefined
type Extra<T> = Partial<Omit<Column<T>, 'key' | 'header' | 'cell'>>

const DASH = '—'

function numberColumn<T>(
  key: string,
  header: ReactNode,
  value: Value<T>,
  format: (n: number) => string,
  { dashZero = false, ...extra }: Extra<T> & { dashZero?: boolean } = {},
): Column<T> {
  return {
    key,
    header,
    numeric: true,
    faint: (r) => !value(r),
    cell: (r) => {
      const n = value(r)
      return n == null || (dashZero && n === 0) ? DASH : format(n)
    },
    ...extra,
  }
}

export const col = {
  /** Texto (o lo que se quiera mostrar). */
  text<T>(key: string, header: ReactNode, cell: (row: T) => ReactNode, extra: Extra<T> = {}): Column<T> {
    return { key, header, cell, ...extra }
  },

  /** Unidades enteras («1,250»); `dashZero`: «—» en vez de 0. */
  units<T>(key: string, header: ReactNode, value: Value<T>, extra?: Extra<T> & { dashZero?: boolean }) {
    return numberColumn(key, header, value, nf0, extra)
  },

  /** Kilos con un decimal («1,250.5»). */
  kg<T>(key: string, header: ReactNode, value: Value<T>, extra?: Extra<T> & { dashZero?: boolean }) {
    return numberColumn(key, header, value, nf1, extra)
  },

  /** Variación en % con signo, en verde si sube y en rojo si baja. */
  change<T>(key: string, header: ReactNode, value: Value<T>, extra: Extra<T> = {}): Column<T> {
    return {
      ...numberColumn(key, header, value, pct1, extra),
      tone: (r) => {
        const n = value(r)
        return n == null ? 'faint' : n < 0 ? 'bad' : 'ok'
      },
      faint: undefined,
      ...extra,
    }
  },
}

/** Tono de una diferencia: rojo si es negativa, verde si no. */
export const signTone = (n: number): CellTone => (n < 0 ? 'bad' : 'ok')
