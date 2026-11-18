import type { KeyboardEvent, ReactNode } from 'react'
import { headerGroups } from '@/shared/ui/lib/data-table'
import { tableStyles as ts, type Align, type CellTone, type Density, type RowTone } from '@/shared/ui/lib/table-styles'
import { cn } from '@/shared/ui/lib/utils'

/**
 * Tabla del sistema. Cada módulo declara sus columnas (a mano o con los atajos de `table-columns`:
 * unidades, kg, porcentaje…) y elige las opciones que necesita (`density`, `striped`,
 * `stickyHeader`, `hover`, `flush`); esta tabla resuelve lo común igual en todas: encabezados
 * agrupados con los nombres centrados, filas agrupadas por un encabezado lateral, columna fija al
 * deslizar en el celular, cifras alineadas, fila de total y filas que se abren con el teclado.
 *
 * Los estilos salen de una sola fuente: `shared/ui/lib/table-styles.ts`.
 */

type Maybe = string | false | null | undefined

export type { Align, CellTone, Density, RowTone }

export interface Column<T> {
  key: string
  header: ReactNode
  /** Texto completo del encabezado (si `header` va abreviado). */
  title?: string
  cell: (row: T, index: number) => ReactNode
  /** Cifra: a la derecha y con números tabulares. */
  numeric?: boolean
  /** Por defecto: las cifras a la derecha y el resto a la izquierda. */
  align?: Align
  /** Lo que significa el valor (bien, mal, atenuado, destacado…); el color lo pone el tema. */
  tone?: CellTone | ((row: T) => CellTone | null | undefined | false)
  /** Valor atenuado (p. ej. un cero). Atajo de `tone: 'faint'`. */
  faint?: (row: T) => boolean
  /** Clase extra de la celda (si un tono no alcanza). */
  className?: Maybe | ((row: T) => Maybe)
  /** Valor de la fila de total (si ninguna columna lo tiene, no hay fila de total). */
  total?: ReactNode
  totalTone?: CellTone | null
  /** Encabezado superior: las columnas seguidas del mismo grupo comparten uno (p. ej. la zona). */
  group?: string | null
  /** Queda fija a la izquierda al deslizar la tabla en el celular. */
  sticky?: boolean
  /** Solo en escritorio. */
  desktopOnly?: boolean
  headerClassName?: Maybe
}

/** Filas bajo un encabezado lateral (p. ej. «Brasa chica» con sus productos). */
export interface RowGroup<T> {
  key: string
  label: ReactNode
  rows: T[]
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rowKey: (row: T) => string
  /** Las filas, o `groups` para filas agrupadas. */
  rows?: T[]
  groups?: RowGroup<T>[]
  /** Encabezado de la columna de grupos (se oculta en el celular). */
  groupHeader?: ReactNode
  /** Rótulo de la fila de total (va en la primera columna). */
  totalLabel?: ReactNode
  /** Abre el detalle de la fila (también con Enter o Espacio). */
  onRowClick?: (row: T) => void
  /** Fila con estilo propio: total, atenuada o que pide atención. */
  rowTone?: (row: T) => RowTone | null | undefined | false
  rowClassName?: (row: T) => Maybe
  /** Separación de filas: `compact` para tablas con muchas columnas. */
  density?: Density
  /** Filas alternadas (tablas largas). */
  striped?: boolean
  /** Resalta la fila bajo el mouse (por defecto, sí). */
  hover?: boolean
  /** La cabecera queda visible al bajar (la tabla desliza dentro de su caja). */
  stickyHeader?: boolean
  /** Sin margen a los lados (dentro de un diálogo). */
  flush?: boolean
  /** Descripción para lectores de pantalla. */
  caption?: string
  className?: string
  /** Clase del contenedor que desliza. */
  wrapperClassName?: string
}

const toneOf = <T,>(c: Column<T>, row: T): CellTone | undefined => {
  if (c.faint?.(row)) return 'faint'
  const tone = typeof c.tone === 'function' ? c.tone(row) : c.tone
  return tone === false || tone == null ? undefined : tone
}

const alignOf = <T,>(c: Column<T>): Align => c.align ?? (c.numeric ? 'right' : 'left')

export function DataTable<T>({
  columns,
  rowKey,
  rows,
  groups,
  groupHeader,
  totalLabel,
  onRowClick,
  rowTone,
  rowClassName,
  density = 'normal',
  striped = false,
  hover = true,
  stickyHeader = false,
  flush = false,
  caption,
  className,
  wrapperClassName,
}: DataTableProps<T>) {
  const sections: RowGroup<T>[] = groups ?? [{ key: '', label: null, rows: rows ?? [] }]
  const grouped = !!groups
  const tops = headerGroups(columns.map((c) => c.group ?? null))
  const twoRows = tops.some((g) => g.name !== null)
  const hasTotal = columns.some((c) => c.total !== undefined)

  const th = (c: Column<T>, extra?: { rowSpan?: number; center?: boolean }) => (
    <th
      key={c.key}
      rowSpan={extra?.rowSpan}
      scope="col"
      title={c.title}
      className={cn(
        ts.th({ density, stickyHeader, align: extra?.center ? (c.align ?? 'center') : alignOf(c) }),
        extra?.center && 'first:pl-3 dsk:first:pl-3',
        c.sticky && ts.sticky,
        c.desktopOnly && ts.desktopOnly,
        c.headerClassName,
      )}
    >
      {c.header}
    </th>
  )

  const topRow = () => {
    if (!twoRows) return columns.map((c) => th(c))
    let at = 0
    return tops.map((g) => {
      const first = at
      at += g.span
      // Columnas sin grupo: ocupan las dos filas del encabezado.
      if (g.name === null) return columns.slice(first, first + g.span).map((c) => th(c, { rowSpan: 2 }))
      return (
        <th
          key={`group-${g.name}-${String(first)}`}
          colSpan={g.span}
          scope="colgroup"
          className={ts.groupTh({ stickyHeader })}
        >
          {g.name}
        </th>
      )
    })
  }

  const open = (row: T) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onRowClick?.(row)
    }
  }

  return (
    <div className={cn(ts.wrapper({ stickyHeader }), wrapperClassName)}>
      <table className={cn(ts.table({ density, flush }), className)}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {grouped && (
              <th
                rowSpan={twoRows ? 2 : 1}
                scope="col"
                className={cn(ts.th({ density, stickyHeader }), ts.desktopOnly)}
              >
                {groupHeader}
              </th>
            )}
            {topRow()}
          </tr>
          {twoRows && <tr>{columns.filter((c) => (c.group ?? null) !== null).map((c) => th(c, { center: true }))}</tr>}
        </thead>
        <tbody>
          {sections.map((section) =>
            section.rows.map((row, r) => {
              const asked = rowTone?.(row)
              const tone = asked === false || asked == null ? undefined : asked
              return (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? open(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    ts.row({ hover: hover && tone !== 'total', striped, clickable: !!onRowClick, tone }),
                    rowClassName?.(row),
                  )}
                >
                  {grouped && r === 0 && (
                    <th scope="rowgroup" rowSpan={section.rows.length} className={ts.rowGroupTh}>
                      {section.label}
                    </th>
                  )}
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        ts.td({ density, align: alignOf(c), numeric: !!c.numeric, tone: toneOf(c, row) }),
                        c.sticky && ts.sticky,
                        // Con grupos, en el celular la primera columna visible es esta: su margen.
                        grouped && i === 0 && 'pl-4 first:pl-4 dsk:pl-3 dsk:first:pl-3',
                        c.desktopOnly && ts.desktopOnly,
                        typeof c.className === 'function' ? c.className(row) : c.className,
                      )}
                    >
                      {c.cell(row, r)}
                    </td>
                  ))}
                </tr>
              )
            }),
          )}
          {hasTotal && (
            <tr className={ts.row({ hover: false, tone: 'total' })}>
              {grouped && <td className={cn(ts.td({ density }), ts.desktopOnly)} />}
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={cn(
                    ts.td({ density, align: alignOf(c), numeric: !!c.numeric, tone: c.totalTone ?? undefined }),
                    c.sticky && ts.stickyTotal,
                    c.desktopOnly && ts.desktopOnly,
                  )}
                >
                  {i === 0 && c.total === undefined ? totalLabel : c.total}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
