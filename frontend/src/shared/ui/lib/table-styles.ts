/**
 * Tablas del sistema: cabecera en texto secundario pequeño, filas separadas por una regla fina,
 * cifras a la derecha en números tabulares y fila de total con regla más marcada.
 * En alto contraste la cabecera y el total llevan regla gruesa (3 px).
 */
export const tableCls = {
  table: 'w-full border-collapse text-base',
  th: 'border-b border-rule-strong px-3 py-2.5 text-right text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-4 first:text-left last:pr-4 hc:border-b-heavy hc:text-sm hc:font-bold hc:text-foreground dsk:first:pl-5 dsk:last:pr-5',
  td: 'border-b border-rule px-3 py-2.5 text-right whitespace-nowrap first:pl-4 first:text-left last:pr-4 dsk:first:pl-5 dsk:last:pr-5',
  total:
    'bg-muted font-semibold [&>td]:border-t [&>td]:border-b-0 [&>td]:border-rule-strong [&>td]:py-3 hc:[&>td]:border-t-heavy hc:[&>td]:border-t-foreground',
  row: 'transition-colors hover:bg-muted',
}
