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
    `border-b border-rule-strong bg-table-head px-3 text-xs font-semibold whitespace-nowrap text-table-head-foreground ${EDGE} hc:border-b-heavy hc:text-sm hc:font-bold hc:text-foreground`,
    {
      variants: {
        density: { compact: 'py-2', normal: 'py-2.5', relaxed: 'py-3' },
        align,
        stickyHeader: { true: 'sticky top-0 z-20', false: '' },
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
      hover: { true: 'group/row transition-colors hover:bg-muted', false: '' },
      striped: { true: 'even:bg-muted/50', false: '' },
      clickable: {
        true: 'cursor-pointer focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        false: '',
      },
      tone: {
        total:
          'bg-table-head font-bold text-table-head-foreground [&>td]:border-t [&>td]:border-b-0 [&>td]:border-rule-strong [&>td]:py-3 hc:[&>td]:border-t-heavy hc:[&>td]:border-t-foreground',
        muted: 'text-muted-foreground',
        attention: 'hc:bg-warn-soft',
      } satisfies Record<RowTone, string>,
    },
    defaultVariants: { hover: true, striped: false, clickable: false },
  }),

  /**
   * Tablas que se editan (registrar proyección y stock): las mismas reglas y colores, con casillas
   * para escribir. Bordes separados para que la columna fija no pierda su borde al deslizar.
   */
  edit: {
    table: 'w-full border-separate border-spacing-0',
    th: 'border-b border-rule-strong bg-table-head px-2 py-2 text-xs font-semibold whitespace-nowrap text-table-head-foreground hc:border-b-heavy hc:border-foreground hc:text-sm hc:font-bold hc:text-foreground',
    /** Columna fija a la izquierda (el producto) en todos los tamaños. */
    stickyCol: 'sticky left-0 z-[1] bg-surface',
    /** Fila de subtotal de un grupo (p. ej. «Brasa chica»). */
    groupRow: '[&>*]:bg-muted [&>*]:text-xs [&>*]:font-semibold [&>*]:text-ink-2',
    /** Fila de total por día. */
    totalRow:
      '[&>td]:border-t [&>td]:border-rule-strong [&>td]:bg-muted [&>td]:py-2.5 [&>td]:font-semibold hc:[&>td]:border-t-heavy hc:[&>td]:border-foreground',
    cell: 'border-b border-rule',
    input: cva(
      'num rounded-md border-control border-input bg-surface font-medium text-foreground outline-none transition-colors placeholder:text-faint focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
      {
        variants: {
          // touch: celular (alto cómodo para el dedo); desktop: escritorio.
          size: { touch: 'h-touch text-md', desktop: 'h-9 text-base', fluid: 'h-touch text-md dsk:h-9 dsk:text-base' },
          align: { center: 'text-center', right: 'px-1.5 text-right' },
          invalid: { true: 'border-bad bg-bad-soft', false: '' },
        },
        defaultVariants: { size: 'fluid', align: 'center', invalid: false },
      },
    ),
  },

  /** Columna fija a la izquierda al deslizar en el celular (en escritorio, normal). */
  // Con hover, la celda fija se pinta igual que su fila (si no, quedaría blanca al pasar el mouse).
  sticky: 'sticky left-0 z-10 bg-surface group-hover/row:bg-muted dsk:static dsk:bg-transparent',
  /**
   * Texto de la columna fija (producto, vendedor): un nombre largo («Pollo entero carne sin
   * menudencia») pasa a dos líneas en vez de ensanchar toda la columna y empujar las cifras.
   */
  stickyText: 'min-w-28 max-w-52 whitespace-normal',
  stickyTotal: 'sticky left-0 z-10 bg-table-head dsk:static',
  desktopOnly: 'hidden dsk:table-cell',
}

export type TableOptions = VariantProps<typeof tableStyles.table> &
  VariantProps<typeof tableStyles.row> &
  VariantProps<typeof tableStyles.wrapper>
