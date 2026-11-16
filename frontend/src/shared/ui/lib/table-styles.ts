/** Tabla con el estilo del mockup (cabecera celeste, fila total). */
export const tableCls = {
  table: 'w-full border-separate border-spacing-0 text-sm',
  th: 'bg-secondary px-3 py-[11px] text-center font-bold whitespace-nowrap text-foreground first:rounded-tl-[10px] first:text-left last:rounded-tr-[10px]',
  td: 'border-b border-muted px-3 py-2.5 text-center whitespace-nowrap first:text-left',
  total:
    '[&>td]:border-0 [&>td]:bg-secondary [&>td]:px-3 [&>td]:py-[13px] [&>td]:text-[15.5px] [&>td]:font-extrabold [&>td:first-child]:rounded-bl-[10px] [&>td:last-child]:rounded-br-[10px]',
  row: 'transition-colors hover:[&>td]:bg-[#F8FBFF]',
}
