import { cva, type VariantProps } from 'class-variance-authority'

/**
 * Estilos de TODAS las tablas del sistema (única fuente: para cambiar cómo se ven, se cambia aquí).
 *
 * Cabecera en texto secundario pequeño, filas separadas por una regla fina, cifras a la derecha en
 * números tabulares y fila de total con regla más marcada. En alto contraste la cabecera y el total
 * llevan regla gruesa (3 px). Cada módulo elige las opciones con las props de `DataTable`
 * (`density`, `striped`, `stickyHeader`, `hover`…) y los tonos de sus celdas (`tone`).
 */

const EDGE = 'first:pl-4 last:pr-4 dsk:first:pl-5 dsk:last:pr-5'

/** Separación vertical de filas: compacta (muchas columnas), normal o amplia. */
export type Density = 'compact' | 'normal' | 'relaxed'
export type Align = 'left' | 'right' | 'center'
/** Tono de una celda: lo que significa el valor, no el color (el color lo pone el tema). */
export type CellTone = 'ok' | 'bad' | 'warn' | 'muted' | 'faint' | 'strong' | 'best'
/** Tono de una fila completa. */
export type RowTone = 'total' | 'muted' | 'attention'

const align = {
  left: 'text-left first:text-left',
  right: 'text-right first:text-right',
  center: 'text-center first:text-center',
} satisfies Record<Align, string>

export const tableStyles = {
  wrapper: cva('relative overflow-x-auto', {
    variants: { stickyHeader: { true: 'max-h-[70vh] overflow-y-auto', false: '' } },
    defaultVariants: { stickyHeader: false },
  }),

  table: cva('w-full border-collapse', {
    variants: {
      density: { compact: 'text-sm', normal: 'text-base', relaxed: 'text-base' },
      // Sin margen a los lados (dentro de un diálogo).
      flush: {
        true: '[&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0',
        false: '',
      },
    },
    defaultVariants: { density: 'normal', flush: false },
  }),

  th: cva(
    `border-b border-rule-strong px-3 text-xs font-medium whitespace-nowrap text-muted-foreground ${EDGE} hc:border-b-heavy hc:text-sm hc:font-bold hc:text-foreground`,
    {
      variants: {
        density: { compact: 'py-2', normal: 'py-2.5', relaxed: 'py-3' },
        align,
        stickyHeader: { true: 'sticky top-0 z-20 bg-surface', false: '' },
      },
      defaultVariants: { density: 'normal', align: 'left', stickyHeader: false },
    },
  ),

  /** Encabezado superior que agrupa columnas (p. ej. la zona sobre sus vendedores). */
  groupTh: cva(
    'eyebrow border-b border-l border-rule px-3 pt-2.5 pb-1.5 text-center whitespace-nowrap hc:text-foreground',
    {
      variants: { stickyHeader: { true: 'sticky top-0 z-20 bg-surface', false: '' } },
      defaultVariants: { stickyHeader: false },
    },
  ),

  /** Encabezado lateral de un grupo de filas (p. ej. «Brasa chica»). */
  rowGroupTh:
    'hidden border-b border-rule-strong py-2.5 pr-3 pl-4 text-left align-top text-xs font-semibold whitespace-nowrap text-ink-2 uppercase dsk:table-cell dsk:pl-5',

  td: cva(`border-b border-rule px-3 whitespace-nowrap ${EDGE}`, {
    variants: {
      density: { compact: 'py-1.5', normal: 'py-2.5', relaxed: 'py-3.5' },
      align,
      numeric: { true: 'num', false: '' },
      tone: {
        ok: 'text-ok',
        bad: 'text-bad',
        warn: 'text-warn',
        muted: 'text-muted-foreground',
        faint: 'text-faint',
        strong: 'font-semibold',
        best: 'bg-ok-soft font-semibold text-ok hc:text-foreground',
      } satisfies Record<CellTone, string>,
    },
    defaultVariants: { density: 'normal', align: 'left', numeric: false },
  }),

  row: cva('', {
    variants: {
      hover: { true: 'transition-colors hover:bg-muted', false: '' },
      striped: { true: 'even:bg-muted/50', false: '' },
      clickable: {
        true: 'cursor-pointer focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        false: '',
      },
      tone: {
        total:
          'bg-muted font-semibold [&>td]:border-t [&>td]:border-b-0 [&>td]:border-rule-strong [&>td]:py-3 hc:[&>td]:border-t-heavy hc:[&>td]:border-t-foreground',
        muted: 'text-muted-foreground',
        attention: 'hc:bg-warn-soft',
      } satisfies Record<RowTone, string>,
    },
    defaultVariants: { hover: true, striped: false, clickable: false },
  }),

  /** Columna fija a la izquierda al deslizar en el celular (en escritorio, normal). */
  sticky: 'sticky left-0 z-10 bg-surface dsk:static dsk:bg-transparent',
  stickyTotal: 'sticky left-0 z-10 bg-muted dsk:static',
  desktopOnly: 'hidden dsk:table-cell',
}

export type TableOptions = VariantProps<typeof tableStyles.table> &
  VariantProps<typeof tableStyles.row> &
  VariantProps<typeof tableStyles.wrapper>
