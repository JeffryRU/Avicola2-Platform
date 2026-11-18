import type { ReactNode } from 'react'
import { headerGroups } from '@/shared/ui/lib/data-table'
import { tableCls } from '@/shared/ui/lib/table-styles'
import { cn } from '@/shared/ui/lib/utils'

/**
 * Tabla de solo lectura del sistema: cada pantalla declara sus columnas (en su `types/` o junto a
 * la pantalla) y esta tabla pone el resto igual en todas: encabezados agrupados, filas agrupadas
 * por un encabezado lateral, columna fija al deslizar en el celular, cifras alineadas, «—» para
 * lo vacío y fila de total. Las tablas que se editan (proyección y stock) usan `tableCls`.
 */

type Align = 'left' | 'right' | 'center'
type Maybe = string | false | null | undefined

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
  /** Clase de la celda (o según la fila: tono, atenuado…). */
  className?: Maybe | ((row: T) => Maybe)
  /** Valor atenuado (p. ej. un cero). */
  faint?: (row: T) => boolean
  /** Valor de la fila de total (si ninguna columna lo tiene, no hay fila de total). */
  total?: ReactNode
  totalClassName?: Maybe
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

export type RowTone = 'total' | 'muted'

interface Props<T> {
  columns: Column<T>[]
  rowKey: (row: T) => string
  /** Las filas, o `groups` para filas agrupadas. */
  rows?: T[]
  groups?: RowGroup<T>[]
  /** Encabezado de la columna de grupos (se oculta en el celular). */
  groupHeader?: ReactNode
  /** Rótulo de la fila de total (va en la primera columna). */
  totalLabel?: ReactNode
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => Maybe
  /** Una fila con estilo propio: «total» (como la de total) o «muted» (texto secundario). */
  rowTone?: (row: T) => RowTone | undefined
  /** Texto más chico (tablas con muchas columnas). */
  dense?: boolean
  /** Sin margen a los lados (dentro de un diálogo). */
  flush?: boolean
  /** Descripción para lectores de pantalla. */
  caption?: string
  className?: string
  /** Clase del contenedor que desliza. */
  wrapperClassName?: string
}

const ALIGN: Record<Align, string> = {
  left: 'text-left first:text-left',
  right: 'text-right first:text-right',
  center: 'text-center first:text-center',
}

function alignOf<T>(c: Column<T>): string {
  return ALIGN[c.align ?? (c.numeric ? 'right' : 'left')]
}

const STICKY = 'sticky left-0 z-10 bg-surface dsk:static dsk:bg-transparent'

export function DataTable<T>({
  columns,
  rowKey,
  rows,
  groups,
  groupHeader,
  totalLabel,
  onRowClick,
  rowClassName,
  rowTone,
  dense,
  flush,
  caption,
  className,
  wrapperClassName,
}: Props<T>) {
  const sections: RowGroup<T>[] = groups ?? [{ key: '', label: null, rows: rows ?? [] }]
  const grouped = !!groups
  const tops = headerGroups(columns.map((c) => c.group ?? null))
  const twoRows = tops.some((g) => g.name !== null)
  const span = twoRows ? 2 : 1
  const hasTotal = columns.some((c) => c.total !== undefined)
  const desk = (c: Column<T>) => c.desktopOnly && 'hidden dsk:table-cell'

  const headerCell = (c: Column<T>, rowSpan?: number) => (
    <th
      key={c.key}
      rowSpan={rowSpan}
      scope="col"
      title={c.title}
      className={cn(tableCls.th, alignOf(c), c.sticky && STICKY, desk(c), c.headerClassName)}
    >
      {c.header}
    </th>
  )

  return (
    <div className={cn('relative overflow-x-auto', wrapperClassName)}>
      <table
        className={cn(
          tableCls.table,
          dense && 'text-sm',
          flush && '[&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0',
          className,
        )}
      >
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {grouped && (
              <th rowSpan={span} scope="col" className={cn(tableCls.th, 'hidden text-left dsk:table-cell')}>
                {groupHeader}
              </th>
            )}
            {twoRows
              ? (() => {
                  let at = 0
                  return tops.map((g) => {
                    const first = at
                    at += g.span
                    // Columnas sin grupo: ocupan las dos filas del encabezado.
                    if (g.name === null) {
                      return columns.slice(first, first + g.span).map((c) => headerCell(c, 2))
                    }
                    return (
                      <th
                        key={`group-${g.name}-${String(first)}`}
                        colSpan={g.span}
                        scope="colgroup"
                        className="eyebrow border-b border-l border-rule px-3 pt-2.5 pb-1.5 text-center whitespace-nowrap hc:text-foreground"
                      >
                        {g.name}
                      </th>
                    )
                  })
                })()
              : columns.map((c) => headerCell(c))}
          </tr>
          {twoRows && (
            <tr>
              {columns
                .filter((c) => (c.group ?? null) !== null)
                .map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    title={c.title}
                    className={cn(
                      tableCls.th,
                      ALIGN[c.align ?? 'center'],
                      'first:pl-3 dsk:first:pl-3',
                      c.headerClassName,
                    )}
                  >
                    {c.header}
                  </th>
                ))}
            </tr>
          )}
        </thead>
        <tbody>
          {sections.map((section) =>
            section.rows.map((row, r) => {
              const tone = rowTone?.(row)
              return (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    tone === 'total' ? tableCls.total : tone === 'muted' ? 'text-muted-foreground' : tableCls.row,
                    onRowClick && 'cursor-pointer',
                    rowClassName?.(row),
                  )}
                >
                  {grouped && r === 0 && (
                    <th
                      scope="rowgroup"
                      rowSpan={section.rows.length}
                      className="hidden border-b border-rule-strong py-2.5 pr-3 pl-4 text-left align-top text-xs font-semibold whitespace-nowrap text-ink-2 uppercase dsk:table-cell dsk:pl-5"
                    >
                      {section.label}
                    </th>
                  )}
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        tableCls.td,
                        alignOf(c),
                        c.numeric && 'num',
                        c.sticky && STICKY,
                        // Con grupos, la primera columna visible en el celular es esta: su margen.
                        grouped && i === 0 && 'pl-4 first:pl-4 dsk:pl-3 dsk:first:pl-3',
                        desk(c),
                        c.faint?.(row) && 'text-faint',
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
            <tr className={tableCls.total}>
              {grouped && <td className={cn(tableCls.td, 'hidden dsk:table-cell')} />}
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={cn(
                    tableCls.td,
                    alignOf(c),
                    c.numeric && 'num',
                    c.sticky && 'sticky left-0 z-10 bg-muted dsk:static',
                    desk(c),
                    c.totalClassName,
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
